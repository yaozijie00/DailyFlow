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
  yToMinutes,
  timeToY,
  formatMinutes,
  formatTimeRange,
  dragRangeToMinutes,
  dragRangeToTimes,
  resizeStartTo,
  resizeEndTo,
  moveTaskBy,
  computeLanes,
  clampBlockY,
  blockInfoLevel,
  taskBlockState,
  type TimelineConfig,
  type TimeRange,
  type TimeSpan,
} from "../../lib/timeline";
import { startOfToday, todayString } from "../../lib/date";
import { plannedDurationMs } from "../../lib/focusConstraint";
import {
  convertNoteToTask,
  noteDragSession,
  noteDropCallbacks,
  noteDropZoneAt,
} from "../../lib/noteConvert";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";

/** 横向滚动触发阈值：栏位使块宽低于该值（px）时内容加宽并横向滚动。 */
const MIN_LANE_WIDTH = 60;
/** 便签拖入时间轴的默认时长（分钟）。 */
const NOTE_DEFAULT_MINUTES = 60;
/** 缩放范围（每像素分钟数）。 */
const MIN_PX = 1;
const MAX_PX = 3;

interface BlockPreview {
  taskId: number;
  startMs: number;
  endMs: number;
  /** 拖动中指针已移出时间轴区域（松开将移出时间轴） */
  removing?: boolean;
}

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
  const selectTask = useTaskStore((s) => s.selectTask);
  const notes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.update);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const taskAreaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number } | null>(null);
  /** 任务块拖拽标记：本次 mousedown 是否真的发生了拖动（抑制拖拽后的 click 选中） */
  const blockDragRef = useRef(false);
  const [preview, setPreview] = useState<TimeRange | null>(null);
  const [blockPreview, setBlockPreview] = useState<BlockPreview | null>(null);
  const [dropPreview, setDropPreview] = useState<BlockPreview | null>(null);
  /** 便签拖入时间轴的落点预览（title 用于 Ghost 显示便签名） */
  const [notePreview, setNotePreview] = useState<{
    startMs: number;
    endMs: number;
    title?: string;
  } | null>(null);
  /** 横向换栏：被拖任务的目标栏（0-based，预览用） */
  const [dragLane, setDragLane] = useState<{ taskId: number; lane: number } | null>(null);
  const dragLaneRef = useRef<{ taskId: number; lane: number } | null>(null);
  /** 用户横向换栏后的持久偏好（会话内有效，taskId → 0-based 栏） */
  const lanePrefRef = useRef<Map<number, number>>(new Map());
  /** 分割线拖动中的范围预览（松手后写回设置） */
  const [rangeOverride, setRangeOverride] = useState<{
    startMinutes: number;
    endMinutes: number;
  } | null>(null);
  const { start: startWindowDrag } = useWindowDrag();

  // 时间轴配置（来自设置页；start/end 仅用于视觉强调与分割线）
  const config: TimelineConfig = {
    startMinutes: settings.timelineStartMinutes,
    endMinutes: settings.timelineEndMinutes,
    snapMinutes: settings.timelineSnapMinutes,
  };
  const pxPerMinute = settings.timelinePxPerMinute;
  const tStart = settings.timelineStartMinutes;
  const tEnd = settings.timelineEndMinutes;
  const snap = settings.timelineSnapMinutes;
  const totalHeight = FULL_DAY_MINUTES * pxPerMinute;

  const effStart = rangeOverride?.startMinutes ?? config.startMinutes;
  const effEnd = rangeOverride?.endMinutes ?? config.endMinutes;

  // 全天小时刻度（00:00-24:00）
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m <= FULL_DAY_MINUTES; m += 60) list.push(m);
    return list;
  }, []);

  // 非整点的 15 分钟刻度（辅助判断 09:15/09:30/09:45 等）
  const quarterTicks = useMemo(() => {
    const list: number[] = [];
    for (let m = 15; m < FULL_DAY_MINUTES; m += 15) {
      if (m % 60 !== 0) list.push(m);
    }
    return list;
  }, []);

  // 全天吸附粒度细线（跳过整点）
  const minorTicks = useMemo(() => {
    const list: number[] = [];
    for (let m = 0; m < FULL_DAY_MINUTES; m += snap) {
      if (m % 60 !== 0) list.push(m);
    }
    return list;
  }, [snap]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // 进入页面时自动滚动到设定范围起点（全幅显示）
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

  // 任务列表 → 时间轴拖拽：悬停显示 Ghost Preview；松开时若在区域内才保存（失败保持原状态）
  useEffect(() => {
    if (!taskDrag) {
      setDropPreview(null);
      return;
    }
    const area = taskAreaRef.current;
    const task = tasks.find((t) => t.id === taskDrag.taskId);
    if (!area || !task) return;
    const cfg: TimelineConfig = {
      startMinutes: tStart,
      endMinutes: tEnd,
      snapMinutes: snap,
    };
    const durationMs =
      task.estimatedDuration != null && task.estimatedDuration > 0
        ? task.estimatedDuration * 1000
        : snap * 60_000;
    const isInside = (ev: MouseEvent) => {
      const rect = area.getBoundingClientRect();
      return (
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom
      );
    };
    const onMove = (ev: MouseEvent) => {
      if (!isInside(ev)) {
        setDropPreview(null);
        return;
      }
      const y = ev.clientY - area.getBoundingClientRect().top;
      const startMs = dragRangeToTimes(y, y, cfg, pxPerMinute).startMs;
      setDropPreview({ taskId: task.id, startMs, endMs: startMs + durationMs });
    };
    const onUp = (ev: MouseEvent) => {
      // 先同步移除监听：若用户松手后同帧内立即拖时间轴块，残留监听会导致
      // 该任务被重复 drop 或 Ghost 串到下一次拖动（任务长度/名称错乱）
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (isInside(ev)) {
        const y = ev.clientY - area.getBoundingClientRect().top;
        const startMs = dragRangeToTimes(y, y, cfg, pxPerMinute).startMs;
        updateTask(task.id, {
          plannedStart: startMs,
          plannedEnd: startMs + durationMs,
        });
      }
      endTaskDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [taskDrag, tasks, updateTask, endTaskDrag, snap, tStart, tEnd, pxPerMinute]);

  function yFromClientY(clientY: number): number {
    const rect = taskAreaRef.current!.getBoundingClientRect();
    return clientY - rect.top;
  }

  /** 便签鼠标拖拽悬停时间轴：按落点计算时间并显示 Ghost 预览（WebView2 下 HTML5 DnD 不可靠）。 */
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (noteDragSession.noteId == null || !taskAreaRef.current) {
        setNotePreview(null);
        return;
      }
      if (noteDropZoneAt(ev.clientX, ev.clientY) !== "timeline") {
        setNotePreview(null);
        return;
      }
      const y = ev.clientY - taskAreaRef.current.getBoundingClientRect().top;
      const startMs = dragRangeToTimes(y, y, config, pxPerMinute).startMs;
      const note = notes.find((n) => n.id === noteDragSession.noteId);
      setNotePreview({
        startMs,
        endMs: startMs + NOTE_DEFAULT_MINUTES * 60_000,
        title: note?.title,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [notes, config, pxPerMinute]);

  /** 便签投放回调：按落点 y 创建带时间块的 Task，原便签标记「已安排」。 */
  useEffect(() => {
    noteDropCallbacks.timeline = (noteId, _clientX, clientY) => {
      setNotePreview(null);
      if (!taskAreaRef.current) return;
      const y = clientY - taskAreaRef.current.getBoundingClientRect().top;
      const startMs = dragRangeToTimes(y, y, config, pxPerMinute).startMs;
      const endMs = startMs + NOTE_DEFAULT_MINUTES * 60_000;
      void convertNoteToTask(
        noteId,
        notes,
        createTask,
        updateNote,
        { scheduledDate: selectedDate, plannedStart: startMs, plannedEnd: endMs },
      );
    };
    return () => {
      delete noteDropCallbacks.timeline;
    };
  }, [notes, createTask, updateNote, selectedDate, config, pxPerMinute]);

  /**
   * 双击任务块：进入该 Task 的 Focus 上下文（跳转专注页并预选该任务）。
   * 若任务有规划时长：按「任务时长 ÷ 当前专注时长」自动规划番茄数；
   * 若结果为 1 个番茄，本次专注时长自动设为任务时长（仅本次，不改全局设置）。
   * 当前已有其他 Focus 在运行：只切换待选上下文，不停止、不破坏当前 Focus Session。
   */
  function handleTaskDoubleClick(task: Task) {
    // 已完成/已取消的任务不再进入专注
    if (task.status === "COMPLETED" || task.status === "CANCELLED") return;
    const T = plannedDurationMs(task);
    if (T != null) {
      const D = useSettingsStore.getState().settings.pomodoroDurationMinutes * 60_000;
      const count = Math.max(1, Math.ceil(T / D));
      const durationMinutes =
        count === 1
          ? Math.max(15, Math.round(T / 60_000))
          : useSettingsStore.getState().settings.pomodoroDurationMinutes;
      usePomodoroStore.getState().setPlannedContext({ durationMinutes, count });
    }
    useAppStore.getState().setPage("focus");
    usePomodoroStore.getState().setPendingTaskId(task.id);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // 仅左键
    e.preventDefault(); // 阻止拖拽过程中选中文字
    const startY = yFromClientY(e.clientY);
    dragRef.current = { startY };

    startWindowDrag(
      {
        onMove: (ev) => {
          const currentY = yFromClientY(ev.clientY);
          setPreview(dragRangeToMinutes(dragRef.current!.startY, currentY, config, pxPerMinute));
        },
        onUp: (ev) => {
          const currentY = yFromClientY(ev.clientY);
          const { startMs, endMs } = dragRangeToTimes(
            dragRef.current!.startY,
            currentY,
            config,
            pxPerMinute,
          );
          dragRef.current = null;
          setPreview(null);
          openCreate({ plannedStart: startMs, plannedEnd: endMs });
        },
      },
      () => {
        dragRef.current = null;
        setPreview(null);
      },
    );
  }

  function startResize(e: React.MouseEvent, task: Task, edge: "start" | "end") {
    e.stopPropagation();
    e.preventDefault(); // 阻止拖拽过程中选中文字
    const taskStart = task.plannedStart!;
    const taskEnd = task.plannedEnd!;

    startWindowDrag(
      {
        onMove: (ev) => {
          const y = yFromClientY(ev.clientY);
          if (edge === "start") {
            const newStart = resizeStartTo(y, taskEnd, config, pxPerMinute);
            setBlockPreview({ taskId: task.id, startMs: newStart, endMs: taskEnd });
          } else {
            const newEnd = resizeEndTo(y, taskStart, config, pxPerMinute);
            setBlockPreview({ taskId: task.id, startMs: taskStart, endMs: newEnd });
          }
        },
        onUp: (ev) => {
          const y = yFromClientY(ev.clientY);
          // 调整后的完整计划范围（未调整的一侧保持原值）
          const newStart =
            edge === "start" ? resizeStartTo(y, taskEnd, config, pxPerMinute) : taskStart;
          const newEnd =
            edge === "end" ? resizeEndTo(y, taskStart, config, pxPerMinute) : taskEnd;
          updateTask(task.id, {
            plannedStart: newStart,
            plannedEnd: newEnd,
            // 同步预计时长（秒），保持任务详情「预计」与时间轴块时长一致
            estimatedDuration: Math.round((newEnd - newStart) / 1000),
          });
          setBlockPreview(null);
        },
      },
      () => setBlockPreview(null),
    );
  }

  function startMove(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    e.preventDefault(); // 阻止拖拽过程中选中文字
    blockDragRef.current = false;
    const origStart = task.plannedStart!;
    const origEnd = task.plannedEnd!;
    const startY = yFromClientY(e.clientY);
    const startX = e.clientX;
    const startLayout = laneSpans.get(task.id);

    // 指针是否已移出时间轴区域（松开 = 移出时间轴，仅清空计划时间，不删除任务）
    const isOutside = (ev: MouseEvent) => {
      const rect = taskAreaRef.current!.getBoundingClientRect();
      return !(
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom
      );
    };

    startWindowDrag(
      {
        onMove: (ev) => {
          blockDragRef.current = true; // 发生过拖动 → 松手后的 click 不触发选中
          const removing = isOutside(ev);
          const deltaY = yFromClientY(ev.clientY) - startY;
          const { startMs, endMs } = moveTaskBy(origStart, origEnd, deltaY, config, pxPerMinute);
          // 横向换栏：按当前块宽估算目标栏（仅多栏组内有效）
          if (startLayout && startLayout.laneCount > 1) {
            const laneW =
              taskAreaRef.current!.getBoundingClientRect().width / startLayout.laneCount;
            const deltaX = ev.clientX - startX;
            const target = Math.min(
              startLayout.laneCount - 1,
              Math.max(0, startLayout.lane - 1 + Math.round(deltaX / laneW)),
            );
            dragLaneRef.current = { taskId: task.id, lane: target };
            setDragLane(dragLaneRef.current);
          } else {
            dragLaneRef.current = null;
            setDragLane(null);
          }
          setBlockPreview({ taskId: task.id, startMs, endMs, removing });
        },
        onUp: (ev) => {
          if (isOutside(ev)) {
            updateTask(task.id, { plannedStart: null, plannedEnd: null });
          } else {
            const deltaY = yFromClientY(ev.clientY) - startY;
            const { startMs, endMs } = moveTaskBy(origStart, origEnd, deltaY, config, pxPerMinute);
            updateTask(task.id, { plannedStart: startMs, plannedEnd: endMs });
            // 保存换栏偏好（会话内），时间长度不变
            const lane = dragLaneRef.current;
            if (lane && lane.taskId === task.id) {
              lanePrefRef.current.set(task.id, lane.lane);
            }
          }
          dragLaneRef.current = null;
          setDragLane(null);
          setBlockPreview(null);
        },
      },
      () => {
        dragLaneRef.current = null;
        setDragLane(null);
        setBlockPreview(null);
      },
    );
  }

  /** 拖动范围分割线（开始/结束）→ 实时预览，松手写回设置。 */
  function startRangeDrag(e: React.MouseEvent, edge: "start" | "end") {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startWindowDrag(
      {
        onMove: (ev) => {
          const y = yFromClientY(ev.clientY);
          const m = Math.round(yToMinutes(y, pxPerMinute) / snap) * snap;
          if (edge === "start") {
            const ns = Math.min(Math.max(m, 0), effEnd - 60);
            setRangeOverride({ startMinutes: ns, endMinutes: effEnd });
          } else {
            const ne = Math.min(Math.max(m, effStart + 60), FULL_DAY_MINUTES);
            setRangeOverride({ startMinutes: effStart, endMinutes: ne });
          }
        },
        onUp: (ev) => {
          const y = yFromClientY(ev.clientY);
          const m = Math.round(yToMinutes(y, pxPerMinute) / snap) * snap;
          if (edge === "start") {
            void updateSettings({ timelineStartMinutes: Math.min(Math.max(m, 0), effEnd - 60) });
          } else {
            void updateSettings({ timelineEndMinutes: Math.min(Math.max(m, effStart + 60), FULL_DAY_MINUTES) });
          }
          setRangeOverride(null);
        },
      },
      () => setRangeOverride(null),
    );
  }

  const scheduledTasks = tasks.filter(
    (t) => t.plannedStart != null && t.plannedEnd != null,
  );

  // 分栏：以「预览位置」参与计算，拖拽/缩放/拖入悬停时实时重排
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
      return lanePrefRef.current.get(id);
    };
    return computeLanes(spans, prefer);
  }, [scheduledTasks, blockPreview, dropPreview, dragLane]);

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
  // 红色「当前时间线」仅今天显示；查看历史/未来日期时隐藏
  const showNowLine =
    selectedDate === todayString() && now >= timelineStartTs && now < timelineEndTs;

  const nowDate = new Date(now);
  const nowLabel = `${String(nowDate.getHours()).padStart(2, "0")}:${String(
    nowDate.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      {/* 缩放控制（sticky 固定顶部，滚动时保持可见） */}
      <div className="sticky top-0 z-40 flex items-center justify-end gap-1 border-b border-neutral-100 bg-white/95 px-2 py-1">
        <span className="text-xs text-neutral-400">缩放</span>
        <button
          onClick={() => zoom(-1)}
          className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          aria-label="缩小时间轴"
        >
          −
        </button>
        <span className="w-8 text-center text-xs tabular-nums text-neutral-600">
          {pxPerMinute.toFixed(1)}
        </span>
        <button
          onClick={() => zoom(1)}
          className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-500 hover:bg-neutral-100"
          aria-label="放大时间轴"
        >
          ＋
        </button>
      </div>

      <div
        className="flex"
        style={{ height: totalHeight, minWidth: Math.max(maxLaneCount * MIN_LANE_WIDTH, 0) }}
      >
        {/* 左侧时间刻度（sticky 固定左侧，不随横向滚动移走） */}
        <div className="sticky left-0 z-10 w-14 shrink-0 bg-white">
          {/* 非整点 15 分钟刻度线（浅色，辅助判断非整点时刻） */}
          {quarterTicks.map((m) => (
            <div
              key={m}
              className="absolute right-0 h-2 w-3 border-t border-neutral-300/80"
              style={{ top: minutesToY(m, pxPerMinute) }}
            />
          ))}
          {/* 整点标签（明显层级） */}
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 text-xs font-medium tabular-nums text-neutral-500"
              style={{ top: minutesToY(m, pxPerMinute) }}
            >
              {formatMinutes(m)}
            </span>
          ))}
        </div>

        {/* 任务区（可拖拽创建 / 任务块可移动、调整 / 横向换栏 / 便签拖入） */}
        <div
          ref={taskAreaRef}
          onMouseDown={handleMouseDown}
          data-note-drop="timeline"
          className="relative flex-1 cursor-crosshair select-none"
        >
            {/* 范围外灰色（早于开始 / 晚于结束） */}
            <div
              className="pointer-events-none absolute left-0 right-0 bg-neutral-100/70"
              style={{ top: 0, height: minutesToY(effStart, pxPerMinute) }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 bg-neutral-100/70"
              style={{
                top: minutesToY(effEnd, pxPerMinute),
                height: totalHeight - minutesToY(effEnd, pxPerMinute),
              }}
            />

            {/* 吸附粒度细线 */}
            {minorTicks.map((m) => (
              <div
                key={m}
                className="absolute left-0 right-0 border-t border-neutral-100"
                style={{ top: minutesToY(m, pxPerMinute) }}
              />
            ))}

            {/* 整点线 */}
            {hours.map((m) => (
              <div
                key={m}
                className="absolute left-0 right-0 border-t border-neutral-200"
                style={{ top: minutesToY(m, pxPerMinute) }}
              />
            ))}

            {/* 范围开始分割线（可拖动） */}
            <div
              onMouseDown={(e) => startRangeDrag(e, "start")}
              className="group absolute left-0 right-0 z-30 -translate-y-1/2 cursor-ns-resize"
              style={{ top: minutesToY(effStart, pxPerMinute) }}
            >
              <div className="h-1.5 w-full bg-neutral-400/40 transition-colors group-hover:bg-neutral-600/60" />
              <span className="absolute left-1 top-0 -translate-y-full rounded bg-neutral-800 px-1 text-[10px] text-white">
                {formatMinutes(effStart)}
              </span>
            </div>

            {/* 范围结束分割线（可拖动） */}
            <div
              onMouseDown={(e) => startRangeDrag(e, "end")}
              className="group absolute left-0 right-0 z-30 -translate-y-1/2 cursor-ns-resize"
              style={{ top: minutesToY(effEnd, pxPerMinute) }}
            >
              <div className="h-1.5 w-full bg-neutral-400/40 transition-colors group-hover:bg-neutral-600/60" />
              <span className="absolute left-1 top-1 rounded bg-neutral-800 px-1 text-[10px] text-white">
                {formatMinutes(effEnd)}
              </span>
            </div>

            {/* 任务块（可整体移动 / 调整上、下边缘 / 横向换栏） */}
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
              const showCategory = height >= 40 && task.categoryId != null;
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
              const info = blockInfoLevel(height);
              const selected = task.id === selectedTaskId;
              return (
                <div
                  key={task.id}
                  onMouseDown={(e) => startMove(e, task)}
                  onClick={() => {
                    if (blockDragRef.current) {
                      blockDragRef.current = false; // 拖拽后的 click 不触发选中
                      return;
                    }
                    selectTask(task.id); // 单击任务块 → 右侧详情面板
                  }}
                  onDoubleClick={() => handleTaskDoubleClick(task)}
                  className={`absolute cursor-grab select-none overflow-hidden rounded text-xs active:cursor-grabbing ${
                    isRemoving
                      ? "bg-red-200 text-red-900 ring-2 ring-red-500"
                      : state === "running"
                        ? "text-neutral-900 ring-2 ring-blue-400/80"
                        : state === "completed"
                          ? "text-neutral-900/80 opacity-75"
                          : state === "cancelled"
                            ? "opacity-40"
                            : "text-neutral-900 hover:brightness-95"
                  } ${
                    selected
                      ? "z-10 ring-2 ring-neutral-900/40"
                      : ""
                  } ${laneStyle ? "" : "left-1 right-1"}`}
                  style={{
                    top,
                    height,
                    backgroundColor: isRemoving ? undefined : `${color}26`,
                    borderLeft: isRemoving ? undefined : `3px solid ${color}`,
                    ...laneStyle,
                  }}
                >
                  {/* 上边缘手柄（调整 plannedStart） */}
                  <div
                    onMouseDown={(e) => startResize(e, task, "start")}
                    title="拖动调整开始时间"
                    className="absolute left-0 right-0 top-0 z-10 h-2 cursor-ns-resize"
                  />
                  <div className="px-2 py-1">
                    {showCategory && (
                      <div className="truncate text-[10px] leading-tight opacity-70">
                        {categoryName}
                      </div>
                    )}
                    {/* 标题行：状态标记 + 标题 */}
                    <div className="flex items-center gap-1">
                      {state === "running" && (
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
                      )}
                      {state === "completed" && (
                        <span className="shrink-0 text-[10px] font-medium text-green-600">✓</span>
                      )}
                      <span
                        className={`truncate ${
                          state === "completed" || state === "cancelled"
                            ? "line-through decoration-neutral-400"
                            : ""
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>
                    {/* 时间行（块够高时显示开始-结束） */}
                    {info.showTime && (
                      <div className="mt-0.5 truncate text-[10px] leading-tight tabular-nums text-neutral-600">
                        {formatTimeRange(startMs, endMs)}
                      </div>
                    )}
                    {/* 描述行（块足够高且有备注时显示） */}
                    {info.showNotes && task.notes && (
                      <div className="mt-0.5 truncate text-[10px] leading-tight text-neutral-500">
                        {task.notes}
                      </div>
                    )}
                  </div>
                  {/* 下边缘手柄（调整 plannedEnd，hover 高亮） */}
                  <div
                    onMouseDown={(e) => startResize(e, task, "end")}
                    title="拖动调整结束时间"
                    className="group absolute bottom-0 left-0 right-0 z-10 h-2.5 cursor-ns-resize"
                  >
                    <div className="h-full w-full transition-colors group-hover:bg-blue-200/70" />
                  </div>
                  {/* 实时时间（移动/resize 时显示） */}
                  {isPreviewing && !isRemoving && (
                    <span className="absolute left-0 top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-sm bg-blue-500 px-1 text-[10px] text-white">
                      {formatTimeRange(startMs, endMs)}
                    </span>
                  )}
                  {/* 拖出提示（松开将移出时间轴，任务保留） */}
                  {isRemoving && (
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-red-500 px-1 text-[10px] font-medium text-white">
                      松开移出时间轴
                    </span>
                  )}
                </div>
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
