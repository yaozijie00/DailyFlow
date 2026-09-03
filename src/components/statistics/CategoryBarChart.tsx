import type { CategoryStatistic } from "../../services/statisticsService";
import { formatDurationCompact } from "../../lib/format";

/**
 * 类别投入横向柱状图（自绘 div，无第三方图表库）。
 * 横轴=类别，条形宽度按投入时长比例；hover 显示 tooltip，右侧显示紧凑时长。
 */
export function CategoryBarChart({ data }: { data: CategoryStatistic[] }) {
  const max = Math.max(1, ...data.map((d) => d.seconds));

  return (
    <div className="space-y-3">
      {data.map((c) => {
        const pct = Math.max(2, Math.round((c.seconds / max) * 100));
        return (
          <div
            key={c.categoryId ?? "deleted"}
            className="group"
            title={`${c.name}：${formatDurationCompact(c.seconds)}`}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: c.color }}
                />
                <span className="truncate text-ink">{c.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink-2">
                {formatDurationCompact(c.seconds)}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: c.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
