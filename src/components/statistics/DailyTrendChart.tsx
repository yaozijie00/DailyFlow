import type { DailyStatistic } from "../../services/statisticsService";
import { formatDurationCompact } from "../../lib/format";

/**
 * 每日投入趋势折线图（自绘 SVG，无第三方库）。
 * 横轴=日期，纵轴=实际 Focus 投入；hover 显示 tooltip。
 */
export function DailyTrendChart({ data }: { data: DailyStatistic[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-3">暂无投入数据</p>;
  }
  const W = 560;
  const H = 140;
  const PAD = 8;
  const max = Math.max(1, ...data.map((d) => d.seconds));
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const y = (seconds: number) => H - PAD - (seconds / max) * (H - PAD * 2);
  const points = data
    .map((d, i) => `${(PAD + i * stepX).toFixed(1)},${y(d.seconds).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="每日投入趋势">
        {/* 网格基线 */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e5e5e5" strokeWidth="1" />
        <polyline
          points={points}
          fill="none"
          stroke="#171717"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* 数据点 */}
        {data.map((d, i) => (
          <circle
            key={d.date}
            cx={PAD + i * stepX}
            cy={y(d.seconds)}
            r="3"
            fill="#171717"
          >
            <title>{`${d.date}：${formatDurationCompact(d.seconds)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}
