import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useTaskStore } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useNoteStore } from "../../stores/noteStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import type { Task } from "../../db/repositories/taskRepository";
import {
  FULL_DAY_MINUTES,
  MIN_BLOCK_HEIGHT,
  minutesToY,
  timeToY,
  formatMinutes,
  formatTimeRange,
  computeLanes,
  clampBlockY,
  taskBlockState,
  type LaneLayout,
  type TimelineConfig,
  type TimeSpan,
} from "../../lib/timeline";
import { startOfToday, todayString } from "../../lib/date";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";
import TimelineToolbar from "./TimelineToolbar";
import TimelineTaskBlock from "./TimelineTaskBlock";
import TimelineScale from "./TimelineScale";
import TimelineGrid from "./TimelineGrid";
import { useTimelineCanvasInteractions } from "./useTimelineCanvasInteractions";
import { useTimelineExternalDrops } from "./useTimelineExternalDrops";

/** 横向滚动触发阈值：栏位使块宽低于该值（px）时内容加宽并横向滚动。 */
const MIN_LANE_WIDTH = 60;
/** 缩放范围（每像素分钟数）。 */
const MIN_PX = 1;
const MAX_PX = 3;

export default function Timeline() {
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const openCreate = useTaskStore((s) => s.openCreate);
  const updateTask = useTaskStore((s) => s.updateTask);
  const createTask = useTaskStore((s) => s.createTask);
  const taskDrag = useTaskStore((s) => s.taskDrag);
  const endTaskDrag = useTaskStore((s) => s.endTaskDrag);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const openTaskDetail = useTaskStore((s) => s.openTaskDetail);
  const convertToNote = useTaskStore((s) => s.convertToNote);
  const notes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.update);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const taskAreaRef = useRef<HTMLDivElement>(null);
  const laneSpansRef = useRef<Map<number, LaneLayout>>(new Map());
  const { start: startWindowDrag } = useWindowDrag();

  const config: TimelineConfig = useMemo(
    () => ({
      startMinutes: settings.timelineStartMinutes,
      endMinutes: settings.timelineEndMinutes,
      snapMinutes: settings.timelineSnapMinutes,
    }),
    [
      settings.timelineStartMinutes,
      settings.timelineEndMinutes,
      settings.timelineSnapMinutes,
    ],
  );
  const pxPerMinute = settings.timelinePxPerMinute;
  const snap = settings.timelineSnapMinutes;
  const totalHeight = FULL_DAY_MINUTES * pxPerMinute;
  const interactions = useTimelineCanvasInteractions({
    taskAreaRef,
    config,
    pxPerMinute,
    startWindowDrag,
    openCreate,
    updateTask,
    updateSettings,
    getLaneLayout: (taskId) => laneSpansRef.current.get(taskId),
  });
  const {
    preview,
    blockPreview,
    dragLane,
    effectiveStart: effStart,
    effectiveEnd: effEnd,
  } = interactions;
  const { dropPreview, notePreview } = useTimelineExternalDrops({
    taskAreaRef,
    tasks,
    taskDrag,
    notes,
    selectedDate,
    config,
    pxPerMinute,
    updateTask,
    createTask,
    updateNote,
    endTaskDrag,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = minutesToY(effStart, pxPerMinute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 缩放：Ctrl + 鼠标滚轮（wheel 需非 passive 才能 preventDefault，避免页面缩放）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerMinute, updateSettings]);

  function zoom(direction: 1 | -1) {
    const old = pxPerMinute;
    const next = Math.min(MAX_PX, Math.max(MIN_PX, old * (direction > 0 ? 1.25 : 0.8)));
    if (next === old) return;
    const el = scrollRef.current;
    const ratio = next / old;
    void updateSettings({ timelinePxPerMinute: Number(next.toFixed(2)) });
    // 缩放后按比例保持滚动位置，避免视口跳动
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollTop * ratio;
    });
  }

  /**
   * 双击任务块：进入该 Task 的 Focus 上下文（跳转专注页并预选该任务）。
   * v1.6：不再根据任务预计时长自动推算/覆盖本次专注时长（由用户在专注页自选）。
   * 当前已有其他 Focus 在运行：只切换待选上下文，不停止、不破坏当前 Focus Session。
   */
  function handleTaskDoubleClick(task: Task) {
    // 已完成/已取消的任务不再进入专注
    if (task.status === "COMPLETED" || task.status === "CANCELLED") return;
    useAppStore.getState().setPage("focus");
    usePomodoroStore.getState().setPendingTaskId(task.id);
  }

  const scheduledTasks = tasks.filter(
    (t) => t.plannedStart != null && t.plannedEnd != null,
  );

  const laneSpans = useMemo(() => {
    const spans: TimeSpan[] = scheduledTasks.map((t) => {
      const isPreviewing = blockPreview?.taskId === t.id;
      return {
        id: t.id,
        startMs: isPreviewing ? blockPreview!.startMs : t.plannedStart!,
        endMs: isPreviewing ? blockPreview!.endMs : t.plannedEnd!,
      };
    });
    if (dropPreview && !scheduledTasks.some((t) => t.id === dropPreview.taskId)) {
      spans.push({
        id: dropPreview.taskId,
        startMs: dropPreview.startMs,
        endMs: dropPreview.endMs,
      });
    }
    const prefer = (id: number): number | undefined => {
      if (dragLane && dragLane.taskId === id) return dragLane.lane;
      return interactions.getPreferredLane(id);
    };
    return computeLanes(spans, prefer);
  }, [scheduledTasks, blockPreview, dropPreview, dragLane, interactions]);
  laneSpansRef.current = laneSpans;

  const maxLaneCount = useMemo(
    () => Array.from(laneSpans.values()).reduce((m, l) => Math.max(m, l.laneCount), 0),
    [laneSpans],
  );

  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const categoryColorMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color ?? NO_CATEGORY_COLOR])),
    [categories],
  );

  const todayStart = startOfToday();
  const timelineStartTs = todayStart + effStart * 60 * 1000;
  const timelineEndTs = todayStart + effEnd * 60 * 1000;
  const showNowLine =
    selectedDate === todayString() && now >= timelineStartTs && now < timelineEndTs;

  const nowDate = new Date(now);
  const nowLabel = `${String(nowDate.getHours()).padStart(2, "0")}:${String(
    nowDate.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <TimelineToolbar
        startMinutes={effStart}
        endMinutes={effEnd}
        pxPerMinute={pxPerMinute}
        onZoom={zoom}
      />

      <div
        className="flex"
        style={{ height: totalHeight, minWidth: Math.max(maxLaneCount * MIN_LANE_WIDTH, 0) }}
      >
        <TimelineScale pxPerMinute={pxPerMinute} />

        <div
          ref={taskAreaRef}
          onMouseDown={interactions.handleCanvasMouseDown}
          data-note-drop="timeline"
          className="relative flex-1 cursor-crosshair select-none"
        >
            <TimelineGrid
              startMinutes={effStart}
              endMinutes={effEnd}
              snapMinutes={snap}
              pxPerMinute={pxPerMinute}
              totalHeight={totalHeight}
              onRangeDrag={interactions.startRangeDrag}
            />

            {scheduledTasks.map((task) => {
              const isPreviewing = blockPreview?.taskId === task.id;
              const isRemoving = isPreviewing && !!blockPreview?.removing;
              const startMs = isPreviewing ? blockPreview.startMs : task.plannedStart!;
              const endMs = isPreviewing ? blockPreview.endMs : task.plannedEnd!;
              // 范围外任务夹取 / 隐藏（B4）
              const clamped = clampBlockY(
                timeToY(startMs, pxPerMinute),
                timeToY(endMs, pxPerMinute),
                totalHeight,
              );
              if (!clamped) return null;
              const { top, height } = clamped;
              const categoryName =
                task.categoryId != null
                  ? (categoryNameMap.get(task.categoryId) ?? "")
                  : "";
              const layout = laneSpans.get(task.id);
              const laneStyle =
                layout && layout.laneCount > 1
                  ? {
                      left: `calc(${(layout.lane - 1) * (100 / layout.laneCount)}% + 2px)`,
                      width: `calc(${100 / layout.laneCount}% - 4px)`,
                    }
                  : undefined;
              const color =
                task.categoryId != null
                  ? (categoryColorMap.get(task.categoryId) ?? NO_CATEGORY_COLOR)
                  : NO_CATEGORY_COLOR;
              // 视觉状态（拖拽/调整中不套用状态样式，避免干扰）
              const state = isPreviewing ? "normal" : taskBlockState(task.status);
              const selected = task.id === selectedTaskId;
              return (
                <TimelineTaskBlock
                  key={task.id}
                  view={{
                    id: task.id,
                    title: task.title,
                    notes: task.notes,
                    categoryName,
                    state,
                    top,
                    height,
                    startMs,
                    endMs,
                    color,
                    selected,
                    isPreviewing,
                    isRemoving,
                    laneStyle,
                  }}
                  onMoveStart={(event) => interactions.startMove(event, task)}
                  onOpen={() => {
                    if (interactions.shouldOpenTask(task.id)) openTaskDetail(task.id);
                  }}
                  onFocus={() => handleTaskDoubleClick(task)}
                  onResizeStart={(event) => interactions.startResize(event, task, "start")}
                  onResizeEnd={(event) => interactions.startResize(event, task, "end")}
                  onMoveToInbox={() => void convertToNote(task.id)}
                />
              );
            })}

            {/* 任务列表拖入：Ghost Preview（拖拽中不写库，松开才保存） */}
            {dropPreview &&
              (() => {
                const gl = laneSpans.get(dropPreview.taskId);
                const ghostLaneStyle =
                  gl && gl.laneCount > 1
                    ? {
                        left: `calc(${(gl.lane - 1) * (100 / gl.laneCount)}% + 2px)`,
                        width: `calc(${100 / gl.laneCount}% - 4px)`,
                      }
                    : undefined;
                return (
                  <div
                    className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-blue-400 bg-blue-500/20"
                    style={{
                      top: timeToY(dropPreview.startMs, pxPerMinute),
                      height: Math.max(
                        timeToY(dropPreview.endMs, pxPerMinute) -
                          timeToY(dropPreview.startMs, pxPerMinute),
                        MIN_BLOCK_HEIGHT,
                      ),
                      ...(ghostLaneStyle ?? { left: "0.25rem", right: "0.25rem" }),
                    }}
                  >
                    <span className="absolute left-0 -translate-y-full whitespace-nowrap bg-blue-500 px-1 text-[10px] text-white">
                      {tasks.find((t) => t.id === dropPreview.taskId)?.title} ·{" "}
                      {formatTimeRange(dropPreview.startMs, dropPreview.endMs)}
                    </span>
                  </div>
                );
              })()}

            {/* 便签拖入：Ghost Preview（松手才创建 Task） */}
            {notePreview &&
              (() => {
                return (
                  <div
                    className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-amber-400 bg-amber-400/20"
                    style={{
                      top: timeToY(notePreview.startMs, pxPerMinute),
                      height: Math.max(
                        timeToY(notePreview.endMs, pxPerMinute) -
                          timeToY(notePreview.startMs, pxPerMinute),
                        MIN_BLOCK_HEIGHT,
                      ),
                      left: "0.25rem",
                      right: "0.25rem",
                    }}
                  >
                    <span className="absolute left-0 -translate-y-full whitespace-nowrap bg-amber-500 px-1 text-[10px] text-white">
                      {notePreview.title ?? "便签"} ·{" "}
                      {formatTimeRange(notePreview.startMs, notePreview.endMs)}
                    </span>
                  </div>
                );
              })()}

            {/* 拖拽创建预览区域 */}
            {preview && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-2 border-blue-500 bg-blue-500/20"
                style={{
                  top: minutesToY(preview.startMinutes, pxPerMinute),
                  height:
                    minutesToY(preview.endMinutes, pxPerMinute) -
                    minutesToY(preview.startMinutes, pxPerMinute),
                }}
              >
                <span className="absolute left-0 -translate-y-full whitespace-nowrap bg-blue-500 px-1 text-[10px] text-white">
                  {formatMinutes(preview.startMinutes)} - {formatMinutes(preview.endMinutes)}
                </span>
              </div>
            )}

            {/* 当前时间线（实时；仅今天显示） */}
            {showNowLine && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-400/70"
                style={{ top: timeToY(now, pxPerMinute) }}
              >
                <span className="absolute left-0 -translate-y-full rounded-sm bg-red-500/90 px-1 text-[10px] font-medium text-white">
                  {nowLabel}
                </span>
              </div>
            )}

            {/* 该时段重叠过多提示 */}
            {maxLaneCount > 6 && (
              <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                该时段重叠过多
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
