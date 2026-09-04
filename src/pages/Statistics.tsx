import { useEffect } from "react";
import { BarChart3 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import {
  useStatisticsStore,
  type RangePreset,
  type StatsTab,
} from "../stores/statisticsStore";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { CategoryBarChart } from "../components/statistics/CategoryBarChart";
import { HourlyLineChart } from "../components/statistics/HourlyLineChart";
import { DailyTrendChart } from "../components/statistics/DailyTrendChart";
import { CompletedTasksChart } from "../components/statistics/CompletedTasksChart";
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

/** 汇总小卡：数值 + 标签。 */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
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

  useEffect(() => {
    if (dbStatus === "ready") {
      void useStatisticsStore.getState().load();
    }
  }, [dbStatus]);

  const hasData =
    overview != null && (overview.totalSeconds > 0 || overview.taskCreated > 0);
  const completionPct =
    overview == null || overview.completionRate <= 0
      ? 0
      : Math.round(overview.completionRate * 100);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="统计"
        description="基于完成的番茄钟实时聚合你的时间投入，并解锁成就。"
      />

      {/* 顶层 Tab：统计 / 成就 */}
      <div className="flex rounded-md border border-neutral-200 bg-white p-0.5 self-start">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded px-4 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
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
            <div className="flex rounded-md border border-neutral-200 bg-white p-0.5">
              {RANGE_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setRange(t.key)}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    range === t.key
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomRange(e.target.value, customTo)}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <span>至</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomRange(customFrom, e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>

          {loading && overview == null ? (
            <div className="text-sm text-neutral-400">统计计算中…</div>
          ) : !hasData ? (
            <EmptyState
              icon={<BarChart3 size={28} />}
              title="这个时间段还没有投入记录"
              description="完成一个番茄钟或任务后，这里会显示你的投入统计。"
            />
          ) : (
            <>
              {/* 核心指标 */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  label="总投入"
                  value={formatDurationCompact(overview!.totalSeconds)}
                  sub={`${overview!.completedFocusCount} 个完成番茄`}
                />
                <StatCard label="专注次数" value={String(overview!.sessionCount)} sub="含提前结束" />
                <StatCard
                  label="完成任务"
                  value={String(overview!.taskCompleted)}
                  sub={`未完成 ${overview!.taskIncomplete}`}
                />
                <StatCard label="完成率" value={`${completionPct}%`} />
              </div>

              {/* 次要指标 */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  label="平均每次专注"
                  value={formatDurationCompact(overview!.avgSessionSeconds)}
                />
                <StatCard label="平均每日投入" value={formatDurationCompact(overview!.avgDailySeconds)} />
                <StatCard label="最常类别" value={overview!.topCategory ?? "—"} />
                <StatCard
                  label="创建任务"
                  value={String(overview!.taskCreated)}
                  sub={`未完成 ${overview!.taskIncomplete}`}
                />
              </div>

              {/* 类别投入柱状图 */}
              <section className="rounded-md border border-neutral-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-medium text-neutral-600">类别投入</h2>
                {overview!.categoryStats.length === 0 ? (
                  <p className="text-sm text-neutral-400">暂无类别投入数据</p>
                ) : (
                  <CategoryBarChart data={overview!.categoryStats} />
                )}
              </section>

              {/* 预计 vs 实际（真实复盘：预计时长 vs 专注实际投入） */}
              {overview!.estimateRowCount > 0 && (
                <section className="rounded-md border border-neutral-200 bg-white p-5">
                  <h2 className="mb-4 text-sm font-medium text-neutral-600">
                    预计 vs 实际
                    <span className="ml-2 text-xs font-normal text-neutral-400">
                      范围内完成任务 {overview!.estimateRowCount} 项 · 实际仅统计真实 Focus Session
                    </span>
                  </h2>
                  <div className="mb-4 grid grid-cols-3 gap-3">
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
                          className="flex items-center gap-3 rounded-md px-2 py-1 text-xs text-neutral-700 odd:bg-neutral-50/60"
                        >
                          <span className="min-w-0 flex-1 truncate">{r.title}</span>
                          <span className="shrink-0 tabular-nums text-neutral-400">
                            预计 {formatDurationCompact(r.estimatedSeconds)}
                          </span>
                          <span className="shrink-0 tabular-nums text-neutral-500">
                            实际 {formatDurationCompact(r.actualSeconds)}
                          </span>
                          <span
                            className={`w-24 shrink-0 text-right font-medium tabular-nums ${
                              diff > 0
                                ? "text-amber-600"
                                : diff < 0
                                  ? "text-green-600"
                                  : "text-neutral-400"
                            }`}
                          >
                            {diff === 0 ? "±0" : diff > 0 ? `+${formatDurationCompact(diff)}` : formatDurationCompact(diff)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* 今日工作轨迹 / 每日投入趋势 */}
              {range === "today" ? (
                <section className="rounded-md border border-neutral-200 bg-white p-5">
                  <h2 className="mb-4 text-sm font-medium text-neutral-600">今日工作轨迹</h2>
                  <HourlyLineChart data={hourlyStats} />
                </section>
              ) : (
                overview!.dailyFocus.length > 0 && (
                  <section className="rounded-md border border-neutral-200 bg-white p-5">
                    <h2 className="mb-4 text-sm font-medium text-neutral-600">每日投入趋势</h2>
                    <DailyTrendChart data={overview!.dailyFocus} />
                  </section>
                )
              )}

              {/* 每日任务（按 scheduledDate 分组；今日显示当天任务） */}
              <section className="rounded-md border border-neutral-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-medium text-neutral-600">每日任务</h2>
                {dailyTasks.length === 0 ? (
                  <p className="text-sm text-neutral-400">该时间段内暂无任务</p>
                ) : (
                  <div className="space-y-4">
                    {dailyTasks.map((g) => (
                      <div key={g.date}>
                        <div className="mb-1 text-xs text-neutral-400">{g.date}</div>
                        <ul className="space-y-1">
                          {g.tasks.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-center gap-2 text-sm text-neutral-700"
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  t.status === "COMPLETED"
                                    ? "bg-green-500"
                                    : t.status === "CANCELLED"
                                      ? "bg-neutral-300"
                                      : "bg-neutral-900"
                                }`}
                              />
                              <span
                                className={`truncate ${
                                  t.status === "COMPLETED" || t.status === "CANCELLED"
                                    ? "text-neutral-400 line-through decoration-neutral-300"
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
                <section className="rounded-md border border-neutral-200 bg-white p-5">
                  <h2 className="mb-4 text-sm font-medium text-neutral-600">每日完成任务</h2>
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
