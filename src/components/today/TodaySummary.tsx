import { useTodayStats } from "../../hooks/useTodayStats";
import { formatDuration } from "../../lib/format";

/** 今日决策摘要：只保留待完成、计划进度与已专注三项核心信息。 */
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
  const remaining = Math.max(0, stats.totalTasks - stats.completedTasks);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-caption">
      <div className="flex items-baseline gap-2">
        <div className="text-[11px] text-text-muted">待完成</div>
        <div className="text-body font-semibold tabular-nums text-text-primary">{remaining}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
          <span>计划进度</span>
          <span className="tabular-nums text-text-faint">{rate}%</span>
        </div>
        <div className="text-body font-semibold tabular-nums text-text-primary">
          {stats.completedTasks}/{stats.totalTasks}
        </div>
        <div className="h-1 w-12 self-center overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="今日完成进度" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${rate}%` }} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-[11px] text-text-muted">已专注</div>
        <div className="text-body font-semibold tabular-nums text-text-primary">
          {formatDuration(stats.totalFocusSeconds) || "0分钟"}
        </div>
        <div className="text-[11px] tabular-nums text-text-faint">{stats.focusCount} 次专注</div>
      </div>
    </div>
  );
}
