import { useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import {
  useStatisticsStore,
  type RangePreset,
  type StatsTab,
} from "../stores/statisticsStore";
import { useFocusStore } from "../features/focus/focusStore";
import { useDataVersion } from "../lib/dataVersion";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { CategoryBarChart } from "../components/statistics/CategoryBarChart";
import { HourlyLineChart } from "../components/statistics/HourlyLineChart";
import { DailyTrendChart } from "../components/statistics/DailyTrendChart";
import { CompletedTasksChart } from "../components/statistics/CompletedTasksChart";
import { HourSlotsChart } from "../components/statistics/HourSlotsChart";
import AchievementsView from "../components/achievements/AchievementsView";
import ReviewView from "../components/statistics/ReviewView";
import { formatDurationCompact } from "../lib/format";

const RANGE_TABS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "days7", label: "近7天" },
  { key: "days30", label: "近30天" },
  { key: "all", label: "全部" },
  { key: "custom", label: "自定义" },
];

const TOP_TABS: { key: StatsTab; label: string }[] = [
  { key: "statistics", label: "统计" },
  { key: "review", label: "复盘" },
  { key: "achievements", label: "成就" },
];

/** 汇总小卡：数值 + 标签（A2：统一 Card 契约）。 */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-text-faint">{sub}</div>}
    </Card>
  );
}

/** 带符号时长文本（秒 → 「+5分钟」/「-5分钟」）。 */
function signedDuration(seconds: number): string {
  if (seconds === 0) return "±0";
  return `${seconds > 0 ? "+" : ""}${formatDurationCompact(seconds)}`;
}

export default function Statistics() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const tab = useStatisticsStore((s) => s.tab);
  const setTab = useStatisticsStore((s) => s.setTab);
  const range = useStatisticsStore((s) => s.range);
  const customFrom = useStatisticsStore((s) => s.customFrom);
  const customTo = useStatisticsStore((s) => s.customTo);
  const loading = useStatisticsStore((s) => s.loading);
  const hourlyStats = useStatisticsStore((s) => s.hourlyStats);
  const overview = useStatisticsStore((s) => s.overview);
  const dailyTasks = useStatisticsStore((s) => s.dailyTasks);
  const setRange = useStatisticsStore((s) => s.setRange);
  const setCustomRange = useStatisticsStore((s) => s.setCustomRange);
  // A1-P0Fix-④：数据变化（任务/专注落库）使统计/成就派生视图失效，自动刷新
  const taskVersion = useDataVersion("task");
  const focusVersionSignal = useFocusStore((s) => s.focusVersion);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useStatisticsStore.getState().load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStatus, taskVersion, focusVersionSignal]);

  const hasData =
    overview != null && (overview.totalSeconds > 0 || overview.taskCreated > 0);
  const completionPct =
    overview == null || overview.completionRate <= 0
      ? 0
      : Math.round(overview.completionRate * 100);

  return (
    <div className="df-page-wide flex flex-col gap-5">
      <PageHeader
        title="统计"
        description="基于完成的番茄钟实时聚合你的时间投入，并解锁成就。"
      />

      {/* 顶层 Tab：统计 / 成就 */}
      <div className="flex rounded-md border border-border-subtle bg-surface p-0.5 self-start">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded px-4 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-accent text-on-accent"
                : "text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "review" ? (
        <ReviewView />
      ) : tab === "achievements" ? (
        <AchievementsView />
      ) : (
        <>
          {/* 范围选择 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border-subtle bg-surface p-0.5">
              {RANGE_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setRange(t.key)}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    range === t.key
                      ? "bg-accent text-on-accent"
                      : "text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomRange(e.target.value, customTo)}
                  className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary"
                />
                <span>至</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomRange(customFrom, e.target.value)}
                  className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary"
                />
              </div>
            )}
          </div>

          {loading && overview == null ? (
            <div className="text-sm text-text-faint">统计计算中…</div>
          ) : !hasData ? (
            <EmptyState
              icon={<BarChart3 size={28} />}
              title="这个时间段还没有投入记录"
              description="完成一个番茄钟或任务后，这里会显示你的投入统计。"
            />
          ) : (
            <>
              {/* 核心指标 */}
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="总投入"
                  value={formatDurationCompact(overview!.totalSeconds)}
                  sub={`${overview!.completedFocusCount} 个完成番茄`}
                />
                <StatCard
                  label="期间完成任务"
                  value={String(overview!.taskCompleted)}
                  sub="按完成时间统计"
                />
                <StatCard
                  label="新建任务完成率"
                  value={`${completionPct}%`}
                  sub="按区间内创建任务统计"
                />
              </div>

              {/* 次要指标 */}
              <details className="rounded-md border border-border-subtle glass-surface">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary">
                  更多指标
                </summary>
                <div className="grid gap-4 border-t border-border-subtle p-4 sm:grid-cols-2 lg:grid-cols-5">
                  <StatCard
                    label="专注次数"
                    value={String(overview!.sessionCount)}
                    sub="含提前结束"
                  />
                  <StatCard
                    label="平均每次专注"
                    value={formatDurationCompact(overview!.avgSessionSeconds)}
                  />
                  <StatCard
                    label="平均每日投入"
                    value={formatDurationCompact(overview!.avgDailySeconds)}
                  />
                  <StatCard label="最常类别" value={overview!.topCategory ?? "—"} />
                  <StatCard
                    label="创建任务"
                    value={String(overview!.taskCreated)}
                    sub={`未完成 ${overview!.taskIncomplete}`}
                  />
                </div>
              </details>

              {/* 类别投入柱状图 */}
              <section className="glass-surface rounded-md border border-border-subtle p-5">
                <h2 className="mb-4 text-sm font-medium text-text-secondary">类别投入</h2>
                {overview!.categoryStats.length === 0 ? (
                  <p className="text-sm text-text-faint">暂无类别投入数据</p>
                ) : (
                  <CategoryBarChart data={overview!.categoryStats} />
                )}
              </section>

              {/* 预计 vs 实际（真实复盘：预计时长 vs 专注实际投入） */}
              {(overview!.estimateRowCount > 0 || overview!.untrackedEstimateCount > 0) && (
                <section className="glass-surface rounded-md border border-border-subtle p-5">
                  <h2 className="mb-4 text-sm font-medium text-text-secondary">
                    预计 vs 实际
                    <span className="ml-2 text-xs font-normal text-text-faint">
                      有效样本 {overview!.estimateRowCount} 项 · 实际仅统计真实 Focus Session
                    </span>
                  </h2>
                  {overview!.untrackedEstimateCount > 0 && (
                    <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                      {overview!.untrackedEstimateCount} 项任务没有实际投入记录，未纳入高估或低估判断。
                    </p>
                  )}
                  {overview!.estimateRowCount > 0 && <><div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatCard
                      label="预计合计"
                      value={formatDurationCompact(overview!.estimatedTotalSeconds)}
                    />
                    <StatCard
                      label="实际合计"
                      value={formatDurationCompact(overview!.actualTotalSeconds)}
                    />
                    <StatCard
                      label="偏差（实际 − 预计）"
                      value={signedDuration(overview!.actualTotalSeconds - overview!.estimatedTotalSeconds)}
                      sub={
                        overview!.actualTotalSeconds > overview!.estimatedTotalSeconds
                          ? "普遍低估了时间"
                          : overview!.actualTotalSeconds < overview!.estimatedTotalSeconds
                            ? "普遍高估了时间"
                            : "估算精准"
                      }
                    />
                  </div>
                  <ul className="space-y-1">
                    {overview!.estimateRows.slice(0, 8).map((r, i) => {
                      const diff = r.actualSeconds - r.estimatedSeconds;
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-3 rounded-md px-2 py-1 text-xs text-text-secondary odd:bg-surface-muted/60"
                        >
                          <span className="min-w-0 flex-1 truncate">{r.title}</span>
                          <span className="shrink-0 tabular-nums text-text-faint">
                            预计 {formatDurationCompact(r.estimatedSeconds)}
                          </span>
                          <span className="shrink-0 tabular-nums text-text-muted">
                            实际 {formatDurationCompact(r.actualSeconds)}
                          </span>
                          <span
                            className={`w-24 shrink-0 text-right font-medium tabular-nums ${
                              diff > 0
                                ? "text-amber-600"
                                : diff < 0
                                  ? "text-green-600"
                                  : "text-text-faint"
                            }`}
                          >
                            {diff === 0 ? "±0" : diff > 0 ? `+${formatDurationCompact(diff)}` : formatDurationCompact(diff)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  </>}
                </section>
              )}

              {/* 今日工作轨迹 / 时段分布 / 每日投入趋势 */}
              {range === "today" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="glass-surface rounded-md border border-border-subtle p-5">
                    <h2 className="mb-4 text-sm font-medium text-text-secondary">今日工作轨迹</h2>
                    <HourlyLineChart data={hourlyStats} />
                  </section>
                  <section className="glass-surface rounded-md border border-border-subtle p-5">
                    <h2 className="mb-4 text-sm font-medium text-text-secondary">时段分布</h2>
                    <HourSlotsChart hourly={hourlyStats} />
                  </section>
                </div>
              ) : (
                overview!.dailyFocus.length > 0 && (
                  <section className="glass-surface rounded-md border border-border-subtle p-5">
                    <h2 className="mb-4 text-sm font-medium text-text-secondary">每日投入趋势</h2>
                    <DailyTrendChart data={overview!.dailyFocus} />
                  </section>
                )
              )}

              {/* 投入 × 完成 效率洞察（范围视图）：完成数/百分钟投入 的“产出效率” */}
              {range !== "today" &&
                overview!.dailyFocus.length > 0 &&
                overview!.taskCompleted > 0 && (
                  <section className="glass-surface rounded-md border border-border-subtle p-5">
                    <h2 className="mb-3 text-sm font-medium text-text-secondary">投入产出效率</h2>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <StatCard
                        label="每专注小时完成任务"
                        value={
                          overview!.totalSeconds > 0
                            ? (overview!.taskCompleted / (overview!.totalSeconds / 3600)).toFixed(1)
                            : "—"
                        }
                        sub="完成任务 ÷ 专注小时"
                      />
                      <StatCard
                        label="平均每次专注产出"
                        value={
                          overview!.sessionCount > 0
                            ? (overview!.taskCompleted / overview!.sessionCount).toFixed(1)
                            : "—"
                        }
                        sub="完成任务 ÷ 专注次数"
                      />
                      <StatCard
                        label="单日最高投入"
                        value={formatDurationCompact(
                          Math.max(0, ...overview!.dailyFocus.map((d) => d.seconds)),
                        )}
                        sub="效率高峰参考"
                      />
                      <StatCard
                        label="单日最高完成"
                        value={String(
                          Math.max(0, ...overview!.dailyCompletedTasks.map((d) => d.count)),
                        )}
                        sub="清单一口气清空的那天"
                      />
                    </div>
                    <p className="mt-3 text-xs text-text-faint">
                      复盘视角：投入不必然等于产出——关注「每专注小时的完成数」是否随投入增加而下降（可能陷入了低效忙碌）。
                    </p>
                  </section>
                )}

              {/* 每日任务（按 scheduledDate 分组；今日显示当天任务） */}
              <section className="glass-surface rounded-md border border-border-subtle p-5">
                <h2 className="mb-4 text-sm font-medium text-text-secondary">每日任务</h2>
                {dailyTasks.length === 0 ? (
                  <p className="text-sm text-text-faint">该时间段内暂无任务</p>
                ) : (
                  <div className="space-y-4">
                    {dailyTasks.map((g) => (
                      <div key={g.date}>
                        <div className="mb-1 text-xs text-text-faint">{g.date}</div>
                        <ul className="space-y-1">
                          {g.tasks.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-center gap-2 text-sm text-text-secondary"
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  t.status === "COMPLETED"
                                    ? "bg-green-500"
                                    : t.status === "CANCELLED"
                                      ? "bg-text-faint"
                                      : "bg-accent"
                                }`}
                              />
                              <span
                                className={`truncate ${
                                  t.status === "COMPLETED" || t.status === "CANCELLED"
                                    ? "text-text-faint line-through decoration-text-faint"
                                    : ""
                                }`}
                              >
                                {t.title}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 每日完成任务 */}
              {overview!.dailyCompletedTasks.length > 0 && (
                <section className="glass-surface rounded-md border border-border-subtle p-5">
                  <h2 className="mb-4 text-sm font-medium text-text-secondary">每日完成任务</h2>
                  <CompletedTasksChart data={overview!.dailyCompletedTasks} />
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
