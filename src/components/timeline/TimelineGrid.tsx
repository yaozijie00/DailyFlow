import type { MouseEvent } from "react";
import { FULL_DAY_MINUTES, formatMinutes, minutesToY } from "../../lib/timeline";

interface TimelineGridProps {
  startMinutes: number;
  endMinutes: number;
  snapMinutes: number;
  pxPerMinute: number;
  totalHeight: number;
  onRangeDrag: (event: MouseEvent<HTMLDivElement>, edge: "start" | "end") => void;
}

/** 时间轴背景层：工作范围、吸附网格和可拖动的范围边界。 */
export default function TimelineGrid({
  startMinutes,
  endMinutes,
  snapMinutes,
  pxPerMinute,
  totalHeight,
  onRangeDrag,
}: TimelineGridProps) {
  const hours = Array.from({ length: 25 }, (_, index) => index * 60);
  const minorTicks: number[] = [];
  for (let minute = 0; minute < FULL_DAY_MINUTES; minute += snapMinutes) {
    if (minute % 60 !== 0) minorTicks.push(minute);
  }

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 right-0 bg-surface-muted/70"
        style={{ top: 0, height: minutesToY(startMinutes, pxPerMinute) }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0 bg-surface-muted/70"
        style={{
          top: minutesToY(endMinutes, pxPerMinute),
          height: totalHeight - minutesToY(endMinutes, pxPerMinute),
        }}
      />
      {minorTicks.map((minute) => (
        <div
          key={minute}
          className="pointer-events-none absolute left-0 right-0 border-t border-border-subtle/50"
          style={{ top: minutesToY(minute, pxPerMinute) }}
        />
      ))}
      {hours.map((minute) => (
        <div
          key={minute}
          className="pointer-events-none absolute left-0 right-0 border-t border-border-subtle"
          style={{ top: minutesToY(minute, pxPerMinute) }}
        />
      ))}
      <div
        onMouseDown={(event) => onRangeDrag(event, "start")}
        className="group absolute left-0 right-0 z-30 -translate-y-1/2 cursor-ns-resize"
        style={{ top: minutesToY(startMinutes, pxPerMinute) }}
        title="拖动调整工作范围开始时间"
      >
        <div className="h-1.5 w-full bg-border-strong/60 transition-colors group-hover:bg-text-secondary/70" />
        <span className="absolute left-1 top-0 -translate-y-full rounded bg-accent px-1 text-[10px] text-on-accent">
          {formatMinutes(startMinutes)}
        </span>
      </div>
      <div
        onMouseDown={(event) => onRangeDrag(event, "end")}
        className="group absolute left-0 right-0 z-30 -translate-y-1/2 cursor-ns-resize"
        style={{ top: minutesToY(endMinutes, pxPerMinute) }}
        title="拖动调整工作范围结束时间"
      >
        <div className="h-1.5 w-full bg-border-strong/60 transition-colors group-hover:bg-text-secondary/70" />
        <span className="absolute left-1 top-1 rounded bg-accent px-1 text-[10px] text-on-accent">
          {formatMinutes(endMinutes)}
        </span>
      </div>
    </>
  );
}
