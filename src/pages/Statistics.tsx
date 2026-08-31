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
import AchievementsView from "../components/achievements/AchievementsView";
import { formatDurationCompact } from "../lib/format";

const RANGE_TABS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "custom", label: "自定义" },
];

const TOP_TABS: { key: StatsTab; label: string }[] = [
  { key: "statistics", label: "统计" },
  { key: "achievements", label: "成就" },
];

export default function Statistics() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const tab = useStatisticsStore((s) => s.tab);
  const setTab = useStatisticsStore((s) => s.setTab);
  const range = useStatisticsStore((s) => s.range);
  const customFrom = useStatisticsStore((s) => s.customFrom);
  const customTo = useStatisticsStore((s) => s.customTo);
  const loading = useStatisticsStore((s) => s.loading);
  const rangeStats = useStatisticsStore((s) => s.rangeStats);
  const categoryStats = useStatisticsStore((s) => s.categoryStats);
  const hourlyStats = useStatisticsStore((s) => s.hourlyStats);
  const setRange = useStatisticsStore((s) => s.setRange);
  const setCustomRange = useStatisticsStore((s) => s.setCustomRange);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useStatisticsStore.getState().load();
    }
  }, [dbStatus]);

  const hasData = (rangeStats?.totalSeconds ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
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

      {tab === "achievements" ? (
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

          {loading && rangeStats == null ? (
            <div className="text-sm text-neutral-400">统计计算中…</div>
          ) : !hasData ? (
            <EmptyState
              icon={<BarChart3 size={28} />}
              title="这个时间段还没有投入记录"
              description="完成一个番茄钟后，这里会显示你的投入统计。"
            />
          ) : (
            <>
              {/* 汇总卡 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-neutral-200 bg-white p-4">
                  <div className="text-xs text-neutral-500">总投入</div>
                  <div className="mt-1 text-3xl font-semibold text-neutral-900">
                    {formatDurationCompact(rangeStats?.totalSeconds ?? 0)}
                  </div>
                </div>
                <div className="rounded-md border border-neutral-200 bg-white p-4">
                  <div className="text-xs text-neutral-500">完成番茄</div>
                  <div className="mt-1 text-3xl font-semibold text-neutral-900">
                    {rangeStats?.completedCount ?? 0}
                    <span className="ml-1 text-sm font-normal text-neutral-500">个</span>
                  </div>
                </div>
              </div>

              {/* 类别投入柱状图 */}
              <section className="rounded-md border border-neutral-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-medium text-neutral-600">类别投入</h2>
                {categoryStats.length === 0 ? (
                  <p className="text-sm text-neutral-400">暂无类别投入数据</p>
                ) : (
                  <CategoryBarChart data={categoryStats} />
                )}
              </section>

              {/* 今日工作轨迹折线图（仅今日范围） */}
              {range === "today" && (
                <section className="rounded-md border border-neutral-200 bg-white p-5">
                  <h2 className="mb-4 text-sm font-medium text-neutral-600">今日工作轨迹</h2>
                  <HourlyLineChart data={hourlyStats} />
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
