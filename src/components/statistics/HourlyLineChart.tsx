import type { HourlyStatistic } from "../../services/statisticsService";
import { formatDurationCompact } from "../../lib/format";

const W = 640;
const H = 180;
const PAD_X = 28;
const PAD_Y = 18;

/** 横轴刻度（小时）显示位置。 */
const X_TICKS = [0, 6, 12, 18, 23];

/**
 * 今日工作轨迹折线图（自绘 SVG）。横轴=小时(0-23)，纵轴=投入时间。
 * 用于表达工作开始时间 / 投入密度 / 高峰 / 空档。
 */
export function HourlyLineChart({ data }: { data: HourlyStatistic[] }) {
  if (data.length === 0) return null;

  const maxSeconds = Math.max(1, ...data.map((d) => d.seconds));
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;

  const x = (i: number) => PAD_X + (i / (data.length - 1)) * innerW;
  const y = (seconds: number) => H - PAD_Y - (seconds / maxSeconds) * innerH;

  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.seconds).toFixed(1)}`).join(" ");
  const areaPath = [
    `M ${x(0).toFixed(1)} ${H - PAD_Y}`,
    ...data.map((d, i) => `L ${x(i).toFixed(1)} ${y(d.seconds).toFixed(1)}`),
    `L ${x(data.length - 1).toFixed(1)} ${H - PAD_Y}`,
    "Z",
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="今日工作轨迹折线图"
    >
      {/* 横向网格线 + 纵轴标签（按最大投入的 0/50/100%） */}
      {[0, 0.5, 1].map((r) => {
        const gy = y(maxSeconds * r);
        return (
          <g key={r}>
            <line x1={PAD_X} x2={W - PAD_X} y1={gy} y2={gy} stroke="#e5e5e5" strokeWidth="1" />
            <text x={PAD_X - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#a3a3a3">
              {formatDurationCompact(maxSeconds * r)}
            </text>
          </g>
        );
      })}

      {/* 面积 + 折线 */}
      <path d={areaPath} fill="rgba(23, 23, 23, 0.06)" />
      <polyline
        points={points}
        fill="none"
        stroke="#171717"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 数据点（hover 显示 tooltip） */}
      {data.map((d, i) =>
        d.seconds > 0 ? (
          <circle
            key={i}
            cx={x(i)}
            cy={y(d.seconds)}
            r="2.5"
            fill="#171717"
          >
            <title>{`${String(i).padStart(2, "0")}:00 · ${formatDurationCompact(d.seconds)}`}</title>
          </circle>
        ) : null,
      )}

      {/* 横轴刻度 */}
      {X_TICKS.map((h) => (
        <text key={h} x={x(h)} y={H - 4} textAnchor="middle" fontSize="9" fill="#a3a3a3">
          {String(h).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}
