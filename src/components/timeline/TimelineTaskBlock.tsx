import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { Check, StickyNote, X } from "lucide-react";
import { blockInfoLevel, formatTimeRange } from "../../lib/timeline";

export type TimelineTaskVisualState = "normal" | "running" | "completed" | "cancelled";

export interface TimelineTaskBlockView {
  id: number;
  title: string;
  notes: string | null;
  categoryName: string;
  state: TimelineTaskVisualState;
  top: number;
  height: number;
  startMs: number;
  endMs: number;
  color: string;
  selected: boolean;
  isPreviewing: boolean;
  isRemoving: boolean;
  laneStyle?: CSSProperties;
}

interface TimelineTaskBlockProps {
  view: TimelineTaskBlockView;
  onMoveStart: (event: MouseEvent<HTMLDivElement>) => void;
  onOpen: () => void;
  onFocus: () => void;
  onResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onResizeEnd: (event: MouseEvent<HTMLDivElement>) => void;
  onMoveToInbox: () => void;
}

const STATE_LABEL: Record<TimelineTaskVisualState, string> = {
  normal: "待办",
  running: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

/** 纯显示与输入边界：时间计算和持久化仍由 Timeline 控制器负责。 */
export default function TimelineTaskBlock({
  view,
  onMoveStart,
  onOpen,
  onFocus,
  onResizeStart,
  onResizeEnd,
  onMoveToInbox,
}: TimelineTaskBlockProps) {
  const info = blockInfoLevel(view.height);
  const showCategory = view.height >= 40 && view.categoryName.length > 0;
  const timeLabel = formatTimeRange(view.startMs, view.endMs);
  const ariaLabel = `${view.title}，${STATE_LABEL[view.state]}，${timeLabel}`;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onMouseDown={onMoveStart}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      onDoubleClick={onFocus}
      className={`group absolute cursor-grab select-none overflow-hidden rounded-md text-left text-xs shadow-sm transition-[filter,box-shadow] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        view.isRemoving
          ? "bg-red-200 text-red-900 ring-2 ring-red-500"
          : view.state === "running"
            ? "text-text-primary ring-2 ring-blue-400/80"
            : view.state === "completed"
              ? "text-text-primary/80 opacity-75"
              : view.state === "cancelled"
                ? "opacity-50"
                : "text-text-primary hover:brightness-95"
      } ${view.selected ? "z-10 ring-2 ring-accent/60" : ""} ${
        view.laneStyle ? "" : "left-1 right-1"
      }`}
      style={{
        top: view.top,
        height: view.height,
        backgroundColor: view.isRemoving ? undefined : `${view.color}33`,
        borderLeft: view.isRemoving ? undefined : `3px solid ${view.color}`,
        ...view.laneStyle,
      }}
    >
      <div
        onMouseDown={onResizeStart}
        title="拖动调整开始时间"
        className="absolute left-0 right-0 top-0 z-10 h-2 cursor-ns-resize"
      />
      <div className="px-2 py-1">
        {showCategory && (
          <div className="truncate text-[10px] font-medium leading-tight text-text-muted">
            {view.categoryName}
          </div>
        )}
        <div className="flex items-center gap-1">
          {view.state === "running" && (
            <span className="shrink-0 text-[9px] font-semibold text-blue-600" aria-hidden="true">
              ●
            </span>
          )}
          {view.state === "completed" && (
            <Check size={11} className="shrink-0 text-green-600" aria-hidden="true" />
          )}
          {view.state === "cancelled" && (
            <X size={11} className="shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <span
            className={`truncate font-medium ${
              view.state === "completed" || view.state === "cancelled"
                ? "line-through decoration-text-faint"
                : ""
            }`}
          >
            {view.title}
          </span>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onMoveToInbox();
            }}
            className="ml-auto flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-text-faint opacity-0 transition-[opacity,color,background-color] hover:bg-amber-50 hover:text-amber-700 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 group-hover:opacity-100"
            title="移回收集箱"
            aria-label="移回收集箱"
          >
            <StickyNote size={12} />
          </button>
        </div>
        {info.showTime && (
          <div className="mt-0.5 truncate text-[10px] leading-tight tabular-nums text-text-secondary">
            {timeLabel}
          </div>
        )}
        {info.showNotes && view.notes && (
          <div className="mt-0.5 truncate text-[10px] leading-tight text-text-muted">
            {view.notes}
          </div>
        )}
      </div>
      <div
        onMouseDown={onResizeEnd}
        title="拖动调整结束时间"
        className="group absolute bottom-0 left-0 right-0 z-10 h-2.5 cursor-ns-resize"
      >
        <div className="h-full w-full transition-colors group-hover:bg-blue-200/70" />
      </div>
      {view.isPreviewing && !view.isRemoving && (
        <span className="absolute left-0 top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-sm bg-blue-500 px-1 text-[10px] text-white">
          {timeLabel}
        </span>
      )}
      {view.isRemoving && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-red-500 px-1 text-[10px] font-medium text-white">
          松开移出时间轴
        </span>
      )}
    </div>
  );
}
