import { useEffect, useState } from "react";
import { Trophy, Check, LockKeyhole } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import {
  useAchievementStore,
  type AchievementFilter,
} from "../../stores/achievementStore";
import type { AchievementProgressView } from "../../services/achievementService";
import { useFocusStore } from "../../features/focus/focusStore";
import { useDataVersion } from "../../lib/dataVersion";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { AchievementIcon } from "./AchievementIcon";
import { formatProgress, formatDurationCompact } from "../../lib/format";

import "./achievements.css";

const FILTERS: { key: AchievementFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unlocked", label: "已解锁" },
  { key: "locked", label: "未解锁" },
  { key: "hidden", label: "隐藏" },
];

/** 成就分组中文名（2.0.x 分类页签；未命中回退原始 category）。 */
const GROUP_LABELS: Record<string, string> = {
  focus: "专注",
  tasks: "任务",
  continuity: "连续",
  execution: "执行",
  review: "复盘",
  basic: "基础",
  productivity: "生产力",
  category: "彩蛋",
  special: "特殊",
  course: "课程",
  plan: "计划",
  explore: "探索",
};

const categoryKey = (category: string) => category === "task" ? "tasks" : category === "secret" ? "category" : category;

function remainingText(a: AchievementProgressView): string {
  const left = Math.max(0, a.target - a.current);
  switch (a.unit) {
    case "minutes":
      return `还差 ${formatDurationCompact(left * 60)}`;
    case "days":
      return `还差 ${Math.round(left)} 天`;
    case "weeks":
      return `还差 ${Math.round(left)} 周`;
    default:
      return `还差 ${Math.round(left)} 次`;
  }
}

function ProgressBar({ percentage }: { percentage: number }) {
  const value = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  return <div className="achievement-progress" role="progressbar" aria-label="成就进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <div style={{ width: `${value}%` }} />
  </div>;
}

function AchievementCard({ item, onOpen }: { item: AchievementProgressView; onOpen: () => void }) {
  const hidden = item.hidden && !item.unlocked;
  return <button onClick={onOpen} className={`achievement-card ${item.unlocked ? "is-unlocked" : ""}`} aria-label={hidden ? "隐藏成就，达成后揭晓" : `${item.name}，${item.unlocked ? "已解锁" : "查看进度"}`}>
    <div className="achievement-card-header">
      <span className="achievement-emblem" aria-hidden="true">{hidden ? <LockKeyhole size={22} /> : <AchievementIcon name={item.icon} size={22} />}</span>
      <div className="achievement-copy"><h3>{hidden ? "隐藏成就" : item.name}</h3><p>{hidden ? "继续探索，达成后揭晓。" : item.description}</p></div>
    </div>
    <div className="achievement-card-footer">
      <div className="achievement-status">{item.unlocked ? <span className="achievement-earned"><Check size={14} aria-hidden="true" />已解锁</span> : <span>{hidden ? "等待发现" : formatProgress(item.current, item.target, item.unit)}</span>}<span>{hidden ? "—" : item.unlocked ? "100%" : `${Math.min(100, Math.max(0, item.percentage))}%`}</span></div>
      {hidden ? <div className="achievement-progress" aria-hidden="true" /> : <ProgressBar percentage={item.unlocked ? 100 : item.percentage} />}
    </div>
  </button>;
}

/**
 * 成就视图（「统计」页的「成就」Tab 内容）：
 * 渐进式可见成就卡片 + 全部/已解锁过滤 + 详情弹窗。
 */
export default function AchievementsView() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const items = useAchievementStore((s) => s.items);
  const loading = useAchievementStore((s) => s.loading);
  const filter = useAchievementStore((s) => s.filter);
  const setFilter = useAchievementStore((s) => s.setFilter);
  const totals = useAchievementStore((s) => s.totals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState("");
  // A1-P0Fix-④：任务/专注数据变化后重新评估成就进度（后台专注完成也能即时反映）
  const taskVersion = useDataVersion("task");
  const focusVersionSignal = useFocusStore((s) => s.focusVersion);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useAchievementStore.getState().load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStatus, taskVersion, focusVersionSignal]);

  // 全部 = 全部可见项；已解锁/未解锁 = 按状态；隐藏 = 未解锁的隐藏成就（???）
  const statusVisible =
    filter === "all"
      ? items
      : filter === "unlocked"
        ? items.filter((i) => i.unlocked)
        : filter === "locked"
          ? items.filter((i) => !i.unlocked)
          : items.filter((i) => !i.unlocked && i.hidden);
  // 分组页签（2.0.x）：按成就分类过滤
  const groups = Array.from(new Set(items.map((i) => categoryKey(i.category))))
    .sort((a, b) => (GROUP_LABELS[a] ?? a).localeCompare(GROUP_LABELS[b] ?? b));
  const visible = group === "" ? statusVisible : statusVisible.filter((i) => categoryKey(i.category) === group);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const unlockPct = totals.total === 0 ? 0 : Math.round((totals.unlocked / totals.total) * 100);

  return (
    <section className="achievements-view" aria-label="成就收藏">
      {/* 顶部总览：已解锁 X / 共 Y · 完成度 */}
      {totals.total > 0 && (
        <div className="achievement-overview">
          <div className="shrink-0">
            <div className="text-lg font-semibold text-text-primary tabular-nums">
              已解锁 {totals.unlocked}
              <span className="text-sm font-normal text-text-faint"> / {totals.total}</span>
            </div>
            <div className="text-xs text-text-muted">完成度 {unlockPct}%</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.min(100, Math.max(0, unlockPct))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 过滤 */}
      <div className="flex rounded-md border border-border-subtle bg-surface p-0.5 self-start">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              filter === f.key
                ? "bg-accent text-on-accent"
                : "text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 分组页签（2.0.x）：专注/任务/连续/复盘/彩蛋… */}
      {groups.length > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setGroup("")}
            aria-pressed={group === ""}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              group === ""
                ? "border-accent bg-accent text-on-accent"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover"
            }`}
          >
            全部
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(group === g ? "" : g)}
              aria-pressed={group === g}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                group === g
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border-subtle text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {GROUP_LABELS[g] ?? g}
            </button>
          ))}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-sm text-text-faint">加载中…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} />}
          title={filter === "hidden" ? "暂无隐藏成就" : "暂无成就"}
          description={
            filter === "hidden"
              ? "隐藏成就达成后才会揭晓。"
              : filter === "unlocked"
                ? "每一次任务完成与真实投入，都会留下积累。"
                : "当前筛选没有匹配的成就，试试其他分类。"
          }
        />
      ) : (
        <div className="achievement-grid">
          {visible.map((item) => <AchievementCard key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />)}
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={selected != null} onClose={() => setSelectedId(null)} title="成就详情">
        {selected && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                selected.unlocked ? "bg-accent/10 text-accent" : "bg-surface-muted text-text-muted"
              }`}
            >
              {selected.hidden && !selected.unlocked ? <LockKeyhole size={30} /> : <AchievementIcon name={selected.icon} size={30} />}
            </span>
            <div>
              <div className="text-lg font-semibold text-text-primary">{selected.hidden && !selected.unlocked ? "隐藏成就" : selected.name}</div>
              <p className="mt-1 text-sm text-text-muted">{selected.hidden && !selected.unlocked ? "继续探索，达成后会揭晓名称与条件。" : selected.description}</p>
            </div>

            {selected.unlocked ? (
              <div className="text-sm font-medium text-accent">✓ 已解锁</div>
            ) : selected.hidden ? null : (
              <div className="w-full max-w-xs space-y-2">
                <ProgressBar percentage={selected.percentage} />
                <div className="flex items-center justify-between text-sm text-text-secondary">
                  <span className="tabular-nums">
                    {formatProgress(selected.current, selected.target, selected.unit)}
                  </span>
                  <span className="tabular-nums">{selected.percentage}%</span>
                </div>
                <div className="text-xs text-text-faint">{remainingText(selected)}</div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </section>
  );
}
