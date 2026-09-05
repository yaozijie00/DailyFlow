import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ProgressRing } from "../mini/ProgressRing";
import { useAppStore } from "../../stores/appStore";
import {
  statisticsService,
  computeRange,
} from "../../stores/statisticsStore";
import { goalService } from "../../stores/goalStore";
import { startOfTomorrow, todayString } from "../../lib/date";
import { formatDurationCompact } from "../../lib/format";
import { buildNarrativeLines } from "../../lib/reviewNarrative";
import {
  REVIEW_STREAK_KEY,
  REVIEW_LAST_WEEK_KEY,
  weekIndexOf,
  nextReviewStreak,
} from "../../lib/reviewStreak";
import { getDb } from "../../db/db";
import { SettingsRepository } from "../../db/repositories/settingsRepository";
import { setWeeklyReviewStreak } from "../../services/achievementService";
import { evaluateAndNotify } from "../../services/achievementRuntime";
import type { OverviewStatistics } from "../../services/statisticsService";

const reviewSettings = new SettingsRepository(getDb());

type ReviewPreset = "today" | "week" | "days30";

const PRESETS: { key: ReviewPreset; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "days30", label: "近30天" },
];

interface ReviewData {
  overview: OverviewStatistics;
  projects: Array<{ projectId: number | null; name: string; seconds: number; count: number }>;
  hourly: Array<{ hour: number; seconds: number }>;
  stalled: Array<{ id: number; title: string }>;
}

function Bar({ value, max, label, right }: { value: number; max: number; label: string; right: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs text-text-secondary">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent/80"
          style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-muted">{right}</span>
    </div>
  );
}

/**
 * 叙述行内数字高亮：把「X 小时 / Y 分钟 / Z% / N 次/项/个」中的**数字**包成强调片段，
 * 单位留在原文（避免重复），使复盘结论从纯文字变为「数字即重点」。
 * 排除：HH:MM 时间段、YYYY-MM-DD 日期、分子式 3/4（避免拆散）。
 */
export function highlightNumbers(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // 匹配「数字」其前不是 : - / 数字，其后跟 空格?+中文单位 或 %（单位不消费，留原文）
  const re = /(?<![:：\-/\d])(\d+(?:\.\d+)?)(?=\s*(小时|分钟|%|次|天|个|周|条|项|h|min))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(
      <span key={k++} className="font-semibold tabular-nums text-accent">
        {m[1]}
      </span>,
    );
    last = m.index + m[1].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : [line];
}

/**
 * 统计页「复盘」Tab（v1.9 Intelligence）：
 * 数字 → 结论：总投入/任务完成/计划偏差/低估率/最佳时段/类别与项目 Top/停滞目标告警 + 叙述。
 */
export default function ReviewView() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const [preset, setPreset] = useState<ReviewPreset>("week");
  const [data, setData] = useState<ReviewData | null>(null);
  const recordedRef = useRef(false);

  // 打开复盘即登记「本周复盘」并评估成就（首次/连续 2/4/8 周）
  useEffect(() => {
    if (dbStatus !== "ready" || recordedRef.current) return;
    recordedRef.current = true;
    const thisWeek = weekIndexOf(Date.now());
    void (async () => {
      try {
        const lastRaw = await reviewSettings.get(REVIEW_LAST_WEEK_KEY);
        const streakRaw = await reviewSettings.get(REVIEW_STREAK_KEY);
        const last = lastRaw ? Number(lastRaw) : null;
        const current = streakRaw ? Number(streakRaw) : 0;
        if (last === thisWeek) {
          setWeeklyReviewStreak(Math.max(1, current));
        } else {
          const next = nextReviewStreak(last, thisWeek, current);
          await reviewSettings.set(REVIEW_LAST_WEEK_KEY, String(thisWeek));
          await reviewSettings.set(REVIEW_STREAK_KEY, String(next));
          setWeeklyReviewStreak(next);
        }
        await evaluateAndNotify();
      } catch {
        /* 登记失败不影响复盘展示 */
      }
    })();
  }, [dbStatus]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let alive = true;
    const { from, to } = computeRange(preset, todayString(), todayString());
    const stalledFrom = Date.now() - 14 * 86_400_000;
    const stalledTo = startOfTomorrow();
    void Promise.all([
      statisticsService.getOverview(from, to),
      statisticsService.getProjectStatistics(from, to),
      statisticsService.getHourlyStatistics(from, to),
      goalService.listStalled(stalledFrom, stalledTo),
    ])
      .then(([overview, projects, hourly, stalled]) => {
        if (alive) setData({ overview, projects, hourly, stalled });
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [dbStatus, preset]);

  const derived = useMemo(() => {
    if (!data) return null;
    const { overview, projects, hourly, stalled } = data;
    let bestHour = -1;
    let bestSeconds = 0;
    hourly.forEach((h) => {
      if (h.seconds > bestSeconds) {
        bestSeconds = h.seconds;
        bestHour = h.hour;
      }
    });
    const sample = overview.estimateRows.filter((r) => r.estimatedSeconds > 0);
    const under = sample.filter((r) => r.actualSeconds > r.estimatedSeconds);
    const avgOverrun = under.length
      ? under.reduce((s, r) => s + (r.actualSeconds - r.estimatedSeconds), 0) / under.length
      : 0;
    const topProject = projects.length > 0 && projects[0].seconds > 0 ? projects[0] : null;
    return { bestHour, bestSeconds, under, sample, avgOverrun, topProject, stalled };
  }, [data]);

  const label = PRESETS.find((p) => p.key === preset)?.label ?? "本周";

  if (!data) {
    return <div className="text-sm text-text-faint">复盘计算中…</div>;
  }

  const ov = data.overview;
  const hasAny = ov.totalSeconds > 0 || ov.taskCreated > 0;
  if (!hasAny) {
    return (
      <div className="rounded-md border border-dashed border-border-strong p-8 text-center text-sm text-text-faint">
        完成几个任务或一次专注后，这里会形成你的工作轨迹与复盘结论。
      </div>
    );
  }

  const completionRate = ov.taskCreated > 0 ? Math.round((ov.taskCompleted / ov.taskCreated) * 100) : 0;
  const maxCategory = ov.categoryStats.length ? ov.categoryStats[0].seconds : 0;
  const maxProject = data.projects.length ? data.projects[0].seconds : 0;
  const hourlyTop = [...data.hourly].sort((a, b) => b.seconds - a.seconds).slice(0, 5);
  const maxHour = hourlyTop.length ? hourlyTop[0].seconds : 0;

  const narrative = buildNarrativeLines({
    label,
    totalSeconds: ov.totalSeconds,
    sessionCount: ov.sessionCount,
    completedFocusCount: ov.completedFocusCount,
    taskCreated: ov.taskCreated,
    taskCompleted: ov.taskCompleted,
    estimatedSeconds: ov.estimatedTotalSeconds,
    actualSeconds: ov.actualTotalSeconds,
    underCount: derived?.under.length ?? 0,
    underSample: derived?.sample.length ?? 0,
    avgOverrunSeconds: derived?.avgOverrun ?? 0,
    bestHour: derived?.bestHour ?? -1,
    bestHourSeconds: derived?.bestSeconds ?? 0,
    topProjectName: derived?.topProject?.name ?? null,
    stalledCount: derived?.stalled.length ?? 0,
  });

  return (
    <div className="space-y-4">
      {/* 时段切换 */}
      <div className="flex rounded-md border border-border-subtle bg-surface p-0.5 self-start">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              preset === p.key
                ? "bg-accent text-on-accent"
                : "text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 概览数字（先数字后结论，便于速览） */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-border-subtle bg-surface p-4">
          <div className="text-xs text-text-muted">总投入</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {formatDurationCompact(ov.totalSeconds)}
          </div>
          <div className="text-xs text-text-faint">{ov.sessionCount} 次专注</div>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface p-4">
          <div className="text-xs text-text-muted">完成任务</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {ov.taskCompleted}
          </div>
          <div className="text-xs text-text-faint">共创建 {ov.taskCreated}</div>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface p-4">
          <div className="text-xs text-text-muted">完成率</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {completionRate}%
          </div>
          <div className="text-xs text-text-faint">未完成 {ov.taskIncomplete}</div>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface p-4">
          <div className="text-xs text-text-muted">平均每次专注</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
            {ov.sessionCount > 0
              ? formatDurationCompact(Math.round(ov.totalSeconds / ov.sessionCount))
              : "—"}
          </div>
          <div className="text-xs text-text-faint">走满 {ov.completedFocusCount} 个番茄</div>
        </div>
      </section>

      {/* 复盘仪表：完成率环 + 番茄质量 + 高效时段（数字可视化，替代纯文字） */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="glass-surface flex items-center gap-4 rounded-md border border-border-subtle p-4">
          <ProgressRing progress={completionRate / 100} size={76} stroke={7}>
            <span className="text-base font-semibold tabular-nums text-text-primary">
              {completionRate}%
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-xs text-text-muted">任务完成率</div>
            <div className="mt-0.5 text-xs text-text-faint">
              完成 {ov.taskCompleted} / 创建 {ov.taskCreated}
            </div>
          </div>
        </div>
        <div className="glass-surface flex items-center gap-4 rounded-md border border-border-subtle p-4">
          <ProgressRing
            progress={
              ov.sessionCount > 0 ? ov.completedFocusCount / ov.sessionCount : 0
            }
            size={76}
            stroke={7}
            color="var(--chart-2)"
          >
            <span className="text-sm font-semibold tabular-nums text-text-primary">
              {ov.sessionCount > 0
                ? Math.round((ov.completedFocusCount / ov.sessionCount) * 100)
                : 0}
              %
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-xs text-text-muted">番茄走满率</div>
            <div className="mt-0.5 text-xs text-text-faint">
              走满 {ov.completedFocusCount} / 共 {ov.sessionCount} 次
            </div>
          </div>
        </div>
        <div className="glass-surface flex items-center gap-4 rounded-md border border-border-subtle p-4">
          {derived && derived.bestHour >= 0 ? (
            <>
              <div className="flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-full bg-accent-soft text-accent">
                <span className="text-lg font-bold tabular-nums">
                  {String(derived.bestHour).padStart(2, "0")}:00
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-text-muted">高能时段</div>
                <div className="mt-0.5 text-xs text-text-faint">
                  投入 {formatDurationCompact(derived.bestSeconds)}
                  <br />
                  复盘后把重要任务排到此时段
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-faint">暂无时段数据</p>
          )}
        </div>
      </section>

      {/* 叙述性复盘 */}
      <section className="glass-surface rounded-md border border-border-subtle p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
          <Sparkles size={14} className="text-amber-500" />
          {label}复盘
        </h2>
        <ul className="space-y-1.5 text-sm text-text-secondary">
          {narrative.map((line, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-text-faint">·</span>
              {/* 数字高亮：把行内时长/百分比/次数等关键数字以强调色呈现（替代纯文字） */}
              <span>
                {highlightNumbers(line)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 类别 / 项目 / 时段 Top */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="glass-surface rounded-md border border-border-subtle p-4">
          <h3 className="mb-3 text-sm font-medium text-text-secondary">类别投入 Top</h3>
          {ov.categoryStats.length === 0 ? (
            <p className="text-xs text-text-faint">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {ov.categoryStats.slice(0, 4).map((c) => (
                <Bar
                  key={c.name}
                  label={c.name}
                  value={c.seconds}
                  max={maxCategory}
                  right={formatDurationCompact(c.seconds)}
                />
              ))}
            </div>
          )}
        </section>
        <section className="glass-surface rounded-md border border-border-subtle p-4">
          <h3 className="mb-3 text-sm font-medium text-text-secondary">项目投入 Top</h3>
          {data.projects.length === 0 ? (
            <p className="text-xs text-text-faint">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {data.projects.slice(0, 4).map((p) => (
                <Bar
                  key={p.projectId ?? "none"}
                  label={p.name}
                  value={p.seconds}
                  max={maxProject}
                  right={formatDurationCompact(p.seconds)}
                />
              ))}
            </div>
          )}
        </section>
        <section className="glass-surface rounded-md border border-border-subtle p-4">
          <h3 className="mb-3 text-sm font-medium text-text-secondary">时段投入 Top</h3>
          {hourlyTop.length === 0 ? (
            <p className="text-xs text-text-faint">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {hourlyTop.map((h) => (
                <Bar
                  key={h.hour}
                  label={`${String(h.hour).padStart(2, "0")}:00`}
                  value={h.seconds}
                  max={maxHour}
                  right={formatDurationCompact(h.seconds)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 停滞目标告警 */}
      {derived && derived.stalled.length > 0 && (
        <section className="rounded-md border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="mb-2 text-sm font-medium text-amber-800">
            进行中但近两周无推进的目标
          </h3>
          <ul className="space-y-1 text-xs text-amber-700/90">
            {derived.stalled.slice(0, 6).map((g) => (
              <li key={g.id}>· {g.title}</li>
            ))}
            {derived.stalled.length > 6 && (
              <li>…还有 {derived.stalled.length - 6} 个</li>
            )}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-text-faint">
        口径：任务完成率按创建口径 · 最佳时段按专注开始小时 · 停滞指近 14 天无关联任务完成
      </p>
    </div>
  );
}
