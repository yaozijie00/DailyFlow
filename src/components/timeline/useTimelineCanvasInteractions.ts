import { useRef, useState, type RefObject } from "react";
import type { Task, UpdateTaskInput } from "../../db/repositories/taskRepository";
import type { WindowDragHandlers } from "../../hooks/useWindowDrag";
import {
  FULL_DAY_MINUTES,
  dragRangeToMinutes,
  dragRangeToTimes,
  moveTaskBy,
  resizeEndTo,
  resizeStartTo,
  yToMinutes,
  type LaneLayout,
  type TimelineConfig,
  type TimeRange,
} from "../../lib/timeline";

export interface BlockPreview {
  taskId: number;
  startMs: number;
  endMs: number;
  removing?: boolean;
}

interface TimelineCanvasInteractionsOptions {
  taskAreaRef: RefObject<HTMLDivElement | null>;
  config: TimelineConfig;
  pxPerMinute: number;
  startWindowDrag: (handlers: WindowDragHandlers, abortState: () => void) => void;
  openCreate: (defaults: { plannedStart: number; plannedEnd: number }) => void;
  updateTask: (id: number, patch: UpdateTaskInput) => unknown;
  updateSettings: (patch: {
    timelineStartMinutes?: number;
    timelineEndMinutes?: number;
  }) => unknown;
  getLaneLayout: (taskId: number) => LaneLayout | undefined;
}

export function useTimelineCanvasInteractions({
  taskAreaRef,
  config,
  pxPerMinute,
  startWindowDrag,
  openCreate,
  updateTask,
  updateSettings,
  getLaneLayout,
}: TimelineCanvasInteractionsOptions) {
  const dragStartRef = useRef<{ startY: number } | null>(null);
  const blockDragRef = useRef(false);
  const lastDraggedBlockRef = useRef<number | null>(null);
  const dragLaneRef = useRef<{ taskId: number; lane: number } | null>(null);
  const lanePrefRef = useRef<Map<number, number>>(new Map());
  const [preview, setPreview] = useState<TimeRange | null>(null);
  const [blockPreview, setBlockPreview] = useState<BlockPreview | null>(null);
  const [dragLane, setDragLane] = useState<{ taskId: number; lane: number } | null>(null);
  const [rangeOverride, setRangeOverride] = useState<{
    startMinutes: number;
    endMinutes: number;
  } | null>(null);

  const effectiveStart = rangeOverride?.startMinutes ?? config.startMinutes;
  const effectiveEnd = rangeOverride?.endMinutes ?? config.endMinutes;

  function yFromClientY(clientY: number): number {
    const area = taskAreaRef.current;
    if (!area) return 0;
    return clientY - area.getBoundingClientRect().top;
  }

  function handleCanvasMouseDown(event: React.MouseEvent): void {
    if (event.button !== 0 || !taskAreaRef.current) return;
    event.preventDefault();
    const startY = yFromClientY(event.clientY);
    dragStartRef.current = { startY };
    startWindowDrag(
      {
        onMove: (moveEvent) => {
          const currentY = yFromClientY(moveEvent.clientY);
          setPreview(
            dragRangeToMinutes(
              dragStartRef.current?.startY ?? startY,
              currentY,
              config,
              pxPerMinute,
            ),
          );
        },
        onUp: (upEvent) => {
          const currentY = yFromClientY(upEvent.clientY);
          const range = dragRangeToTimes(
            dragStartRef.current?.startY ?? startY,
            currentY,
            config,
            pxPerMinute,
          );
          dragStartRef.current = null;
          setPreview(null);
          openCreate({ plannedStart: range.startMs, plannedEnd: range.endMs });
        },
      },
      () => {
        dragStartRef.current = null;
        setPreview(null);
      },
    );
  }

  function startResize(
    event: React.MouseEvent,
    task: Task,
    edge: "start" | "end",
  ): void {
    event.stopPropagation();
    event.preventDefault();
    const taskStart = task.plannedStart!;
    const taskEnd = task.plannedEnd!;
    startWindowDrag(
      {
        onMove: (moveEvent) => {
          const y = yFromClientY(moveEvent.clientY);
          setBlockPreview({
            taskId: task.id,
            startMs:
              edge === "start"
                ? resizeStartTo(y, taskEnd, config, pxPerMinute)
                : taskStart,
            endMs:
              edge === "end" ? resizeEndTo(y, taskStart, config, pxPerMinute) : taskEnd,
          });
        },
        onUp: (upEvent) => {
          const y = yFromClientY(upEvent.clientY);
          const newStart =
            edge === "start" ? resizeStartTo(y, taskEnd, config, pxPerMinute) : taskStart;
          const newEnd =
            edge === "end" ? resizeEndTo(y, taskStart, config, pxPerMinute) : taskEnd;
          updateTask(task.id, {
            plannedStart: newStart,
            plannedEnd: newEnd,
            estimatedDuration: Math.round((newEnd - newStart) / 1000),
          });
          setBlockPreview(null);
        },
      },
      () => setBlockPreview(null),
    );
  }

  function startMove(event: React.MouseEvent, task: Task): void {
    event.stopPropagation();
    event.preventDefault();
    blockDragRef.current = false;
    const origStart = task.plannedStart!;
    const origEnd = task.plannedEnd!;
    const startY = yFromClientY(event.clientY);
    const startX = event.clientX;
    const startLayout = getLaneLayout(task.id);
    const isOutside = (moveEvent: MouseEvent) => {
      const rect = taskAreaRef.current?.getBoundingClientRect();
      if (!rect) return true;
      return !(
        moveEvent.clientX >= rect.left &&
        moveEvent.clientX <= rect.right &&
        moveEvent.clientY >= rect.top &&
        moveEvent.clientY <= rect.bottom
      );
    };
    const clearMoveState = () => {
      dragLaneRef.current = null;
      setDragLane(null);
      setBlockPreview(null);
    };
    startWindowDrag(
      {
        onMove: (moveEvent) => {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) {
            blockDragRef.current = true;
            lastDraggedBlockRef.current = task.id;
          }
          const deltaY = yFromClientY(moveEvent.clientY) - startY;
          const moved = moveTaskBy(origStart, origEnd, deltaY, config, pxPerMinute);
          if (startLayout && startLayout.laneCount > 1 && taskAreaRef.current) {
            const laneWidth =
              taskAreaRef.current.getBoundingClientRect().width / startLayout.laneCount;
            const target = Math.min(
              startLayout.laneCount - 1,
              Math.max(
                0,
                startLayout.lane - 1 + Math.round((moveEvent.clientX - startX) / laneWidth),
              ),
            );
            dragLaneRef.current = { taskId: task.id, lane: target };
            setDragLane(dragLaneRef.current);
          } else {
            dragLaneRef.current = null;
            setDragLane(null);
          }
          setBlockPreview({ ...moved, taskId: task.id, removing: isOutside(moveEvent) });
        },
        onUp: (upEvent) => {
          if (isOutside(upEvent)) {
            updateTask(task.id, { plannedStart: null, plannedEnd: null });
          } else {
            const deltaY = yFromClientY(upEvent.clientY) - startY;
            const moved = moveTaskBy(origStart, origEnd, deltaY, config, pxPerMinute);
            updateTask(task.id, { plannedStart: moved.startMs, plannedEnd: moved.endMs });
            const lane = dragLaneRef.current;
            if (lane?.taskId === task.id) lanePrefRef.current.set(task.id, lane.lane);
          }
          clearMoveState();
        },
      },
      clearMoveState,
    );
  }

  function startRangeDrag(event: React.MouseEvent, edge: "start" | "end"): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startWindowDrag(
      {
        onMove: (moveEvent) => {
          const minutes =
            Math.round(yToMinutes(yFromClientY(moveEvent.clientY), pxPerMinute) / config.snapMinutes) *
            config.snapMinutes;
          setRangeOverride(
            edge === "start"
              ? {
                  startMinutes: Math.min(Math.max(minutes, 0), effectiveEnd - 60),
                  endMinutes: effectiveEnd,
                }
              : {
                  startMinutes: effectiveStart,
                  endMinutes: Math.min(
                    Math.max(minutes, effectiveStart + 60),
                    FULL_DAY_MINUTES,
                  ),
                },
          );
        },
        onUp: (upEvent) => {
          const minutes =
            Math.round(yToMinutes(yFromClientY(upEvent.clientY), pxPerMinute) / config.snapMinutes) *
            config.snapMinutes;
          if (edge === "start") {
            void updateSettings({
              timelineStartMinutes: Math.min(Math.max(minutes, 0), effectiveEnd - 60),
            });
          } else {
            void updateSettings({
              timelineEndMinutes: Math.min(
                Math.max(minutes, effectiveStart + 60),
                FULL_DAY_MINUTES,
              ),
            });
          }
          setRangeOverride(null);
        },
      },
      () => setRangeOverride(null),
    );
  }

  function shouldOpenTask(taskId: number): boolean {
    const suppressed = blockDragRef.current && lastDraggedBlockRef.current === taskId;
    blockDragRef.current = false;
    lastDraggedBlockRef.current = null;
    return !suppressed;
  }

  return {
    preview,
    blockPreview,
    dragLane,
    rangeOverride,
    effectiveStart,
    effectiveEnd,
    handleCanvasMouseDown,
    startResize,
    startMove,
    startRangeDrag,
    shouldOpenTask,
    getPreferredLane: (taskId: number) => lanePrefRef.current.get(taskId),
  };
}
