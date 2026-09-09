import { Clock3, Minus, Plus } from "lucide-react";
import { formatMinutes } from "../../lib/timeline";

interface TimelineToolbarProps {
  startMinutes: number;
  endMinutes: number;
  pxPerMinute: number;
  onZoom: (direction: 1 | -1) => void;
}

/** 时间轴显示控制：与任务拖拽状态分离，便于后续增加视图密度和日期范围。 */
export default function TimelineToolbar({
  startMinutes,
  endMinutes,
  pxPerMinute,
  onZoom,
}: TimelineToolbarProps) {
  return (
    <div className="sticky top-0 z-40 flex min-h-10 items-center justify-between gap-3 border-b border-border-subtle glass-surface px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <span className="flex shrink-0 items-center gap-1.5 font-medium text-text-secondary">
          <Clock3 size={14} className="text-accent" />
          {formatMinutes(startMinutes)}–{formatMinutes(endMinutes)}
        </span>
        <span className="hidden truncate text-text-faint xl:inline">
          拖动空白创建 · 拖动任务调整 · 双击任务开始专注
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1" aria-label="时间轴缩放">
        <button
          type="button"
          onClick={() => onZoom(-1)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-surface text-text-muted transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-label="缩小时间轴"
        >
          <Minus size={14} />
        </button>
        <span className="w-11 text-center text-xs font-medium tabular-nums text-text-secondary">
          {Math.round(pxPerMinute * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoom(1)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-surface text-text-muted transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          aria-label="放大时间轴"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
