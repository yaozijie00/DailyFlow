import { useTodayStats } from "../../hooks/useTodayStats";
import { formatDuration } from "../../lib/format";

/** 今日完成情况卡片：任务总数 / 完成数 / 完成率 / 专注总时长 / 专注次数，实时聚合。 */
export default function TodaySummary() {
  const stats = useTodayStats();

  if (!stats) {
    return (
      <div className="rounded-md border border-border-subtle glass-surface px-4 py-2 text-sm text-text-faint">
        统计计算中…
      </div>
    );
  }

  const rate = Math.round(stats.completionRate * 100);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border border-border-subtle glass-surface px-4 py-2 text-sm text-text-secondary shadow-card">
      <span>
        今日任务{" "}
        <span className="font-medium text-text-primary">{stats.totalTasks}</span>
      </span>
      <span>
        完成任务{" "}
        <span className="font-medium text-text-primary">
          {stats.completedTasks}/{stats.totalTasks}
        </span>
      </span>
      <span>
        完成率{" "}
        <span className="font-medium text-text-primary">{rate}%</span>
      </span>
      <span>
        今日专注{" "}
        <span className="font-medium text-text-primary">
          {formatDuration(stats.totalFocusSeconds) || "0分钟"}
        </span>
      </span>
      <span>
        专注次数{" "}
        <span className="font-medium text-text-primary">{stats.focusCount}</span> 次
      </span>
    </div>
  );
}
