import { motion } from "motion/react";
import type { DailyStatistic } from "../../services/statisticsService";
import { formatDurationCompact } from "../../lib/format";

/**
 * 每日投入趋势图（自绘 SVG + Motion 入场动画，色随主题 token）。
 * 横轴=日期，纵轴=实际 Focus 投入；hover 显示 tooltip。
 */
export function DailyTrendChart({ data }: { data: DailyStatistic[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-text-faint">暂无投入数据</p>;
  }
  const W = 560;
  const H = 150;
  const PAD = 8;
  const max = Math.max(1, ...data.map((d) => d.seconds));
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const y = (seconds: number) => H - PAD - (seconds / max) * (H - PAD * 2);
  const points = data
    .map((d, i) => `${(PAD + i * stepX).toFixed(1)},${y(d.seconds).toFixed(1)}`)
    .join(" ");
  // 面积路径（闭合到底部基线）
  const area = data.length > 0
    ? [
        `M ${PAD} ${H - PAD}`,
        ...data.map((d, i) => `L ${(PAD + i * stepX).toFixed(1)} ${y(d.seconds).toFixed(1)}`),
        `L ${(PAD + (data.length - 1) * stepX).toFixed(1)} ${H - PAD}`,
        "Z",
      ].join(" ")
    : "";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="每日投入趋势">
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 网格基线 */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--chart-grid)" strokeWidth="1" />
        {/* 渐变面积（入场从 0 高度展开 → 用透明度动画近似） */}
        {area && (
          <motion.path
            d={area}
            fill="url(#trendArea)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          />
        )}
        {/* 折线（描边路径入场动画：dash 生长） */}
        <motion.polyline
          points={points}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        {/* 数据点 */}
        {data.map((d, i) => (
          <motion.circle
            key={d.date}
            cx={PAD + i * stepX}
            cy={y(d.seconds)}
            r="3"
            fill="var(--chart-1)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.02 }}
            style={{ transformOrigin: `${PAD + i * stepX}px ${y(d.seconds)}px` }}
          >
            <title>{`${d.date}：${formatDurationCompact(d.seconds)}`}</title>
          </motion.circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-text-faint">
        <span>{data[0].date}</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  );
}
