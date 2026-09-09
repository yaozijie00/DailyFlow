import { FULL_DAY_MINUTES, formatMinutes, minutesToY } from "../../lib/timeline";

const HOURS = Array.from({ length: 25 }, (_, index) => index * 60);
const QUARTER_TICKS = Array.from(
  { length: Math.floor(FULL_DAY_MINUTES / 15) },
  (_, index) => (index + 1) * 15,
).filter((minute) => minute < FULL_DAY_MINUTES && minute % 60 !== 0);

/** 左侧时间标尺；只负责刻度显示，不参与拖拽或数据写入。 */
export default function TimelineScale({ pxPerMinute }: { pxPerMinute: number }) {
  return (
    <div
      className="sticky left-0 z-10 w-14 shrink-0 border-r border-border-subtle glass-surface"
      aria-hidden="true"
    >
      {QUARTER_TICKS.map((minute) => (
        <div
          key={minute}
          className="absolute right-0 h-2 w-2.5 border-t border-border-strong/80"
          style={{ top: minutesToY(minute, pxPerMinute) }}
        />
      ))}
      {HOURS.map((minute) => (
        <span
          key={minute}
          className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-text-muted"
          style={{ top: minutesToY(minute, pxPerMinute) }}
        >
          {formatMinutes(minute)}
        </span>
      ))}
    </div>
  );
}
