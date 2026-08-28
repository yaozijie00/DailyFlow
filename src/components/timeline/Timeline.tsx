import { useEffect, useMemo, useRef, useState } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import type { Task } from "../../db/repositories/taskRepository";
import {
  PX_PER_MINUTE,
  minutesToY,
  timeToY,
  formatMinutes,
  formatTimeRange,
  dragRangeToMinutes,
  dragRangeToTimes,
  resizeStartTo,
  resizeEndTo,
  moveTaskBy,
  findOverlappingIds,
  clampBlockY,
  type TimelineConfig,
  type TimeRange,
} from "../../lib/timeline";
import { startOfToday } from "../../lib/date";

interface BlockPreview {
  taskId: number;
  startMs: number;
  endMs: number;
}

export default function Timeline() {
  const tasks = useTaskStore((s) => s.tasks);
  const openCreate = useTaskStore((s) => s.openCreate);
  const updateTask = useTaskStore((s) => s.updateTask);
  const settings = useSettingsStore((s) => s.settings);
  const [now, setNow] = useState(() => Date.now());
  const taskAreaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number } | null>(null);
  const [preview, setPreview] = useState<TimeRange | null>(null);
  const [blockPreview, setBlockPreview] = useState<BlockPreview | null>(null);
  const { start: startWindowDrag } = useWindowDrag();

  // 时间轴配置（来自设置页，未加载时用默认 08:00-24:00 / 15 分钟）
  const config: TimelineConfig = {
    startMinutes: settings.timelineStartMinutes,
    endMinutes: settings.timelineEndMinutes,
    snapMinutes: settings.timelineSnapMinutes,
  };
  const totalHeight = (config.endMinutes - config.startMinutes) * PX_PER_MINUTE;

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = config.startMinutes; m <= config.endMinutes; m += 60) {
      list.push(m);
    }
    return list;
  }, [config.startMinutes, config.endMinutes]);

  const minorTicks = useMemo(() => {
    const list: number[] = [];
    for (
      let m = config.startMinutes;
      m < config.endMinutes;
      m += config.snapMinutes
    ) {
      if (m % 60 !== 0) list.push(m);
    }
    return list;
  }, [config.startMinutes, config.endMinutes, config.snapMinutes]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function yFromClientY(clientY: number): number {
    const rect = taskAreaRef.current!.getBoundingClientRect();
    return clientY - rect.top;
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return; // 仅左键
    const startY = yFromClientY(e.clientY);
    dragRef.current = { startY };

    startWindowDrag(
      {
        onMove: (ev) => {
          const currentY = yFromClientY(ev.clientY);
          setPreview(dragRangeToMinutes(dragRef.current!.startY, currentY, config));
        },
        onUp: (ev) => {
          const currentY = yFromClientY(ev.clientY);
          const { startMs, endMs } = dragRangeToTimes(
            dragRef.current!.startY,
            currentY,
            config,
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
    const taskStart = task.plannedStart!;
    const taskEnd = task.plannedEnd!;

    startWindowDrag(
      {
        onMove: (ev) => {
          const y = yFromClientY(ev.clientY);
          if (edge === "start") {
            const newStart = resizeStartTo(y, taskEnd, config);
            setBlockPreview({ taskId: task.id, startMs: newStart, endMs: taskEnd });
          } else {
            const newEnd = resizeEndTo(y, taskStart, config);
            setBlockPreview({ taskId: task.id, startMs: taskStart, endMs: newEnd });
          }
        },
        onUp: (ev) => {
          const y = yFromClientY(ev.clientY);
          if (edge === "start") {
            updateTask(task.id, { plannedStart: resizeStartTo(y, taskEnd, config) });
          } else {
            updateTask(task.id, { plannedEnd: resizeEndTo(y, taskStart, config) });
          }
          setBlockPreview(null);
        },
      },
      () => setBlockPreview(null),
    );
  }

  function startMove(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    const origStart = task.plannedStart!;
    const origEnd = task.plannedEnd!;
    const startY = yFromClientY(e.clientY);

    startWindowDrag(
      {
        onMove: (ev) => {
          const deltaY = yFromClientY(ev.clientY) - startY;
          const { startMs, endMs } = moveTaskBy(origStart, origEnd, deltaY, config);
          setBlockPreview({ taskId: task.id, startMs, endMs });
        },
        onUp: (ev) => {
          const deltaY = yFromClientY(ev.clientY) - startY;
          const { startMs, endMs } = moveTaskBy(origStart, origEnd, deltaY, config);
          setBlockPreview(null);
          updateTask(task.id, { plannedStart: startMs, plannedEnd: endMs });
        },
      },
      () => setBlockPreview(null),
    );
  }

  const scheduledTasks = tasks.filter(
    (t) => t.plannedStart != null && t.plannedEnd != null,
  );

  const overlappingIds = useMemo(
    () =>
      findOverlappingIds(
        scheduledTasks.map((t) => ({
          id: t.id,
          startMs: t.plannedStart!,
          endMs: t.plannedEnd!,
        })),
      ),
    [scheduledTasks],
  );

  const todayStart = startOfToday();
  const timelineStartTs = todayStart + config.startMinutes * 60 * 1000;
  const timelineEndTs = todayStart + config.endMinutes * 60 * 1000;
  const showNowLine = now >= timelineStartTs && now < timelineEndTs;

  const nowDate = new Date(now);
  const nowLabel = `${String(nowDate.getHours()).padStart(2, "0")}:${String(
    nowDate.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <div className="flex">
      {/* 左侧时间刻度 */}
      <div
        className="relative w-14 shrink-0"
        style={{ height: totalHeight }}
      >
        {hours.map((m) => (
          <span
            key={m}
            className="absolute right-2 -translate-y-1/2 text-xs text-neutral-400"
            style={{ top: minutesToY(m, config) }}
          >
            {formatMinutes(m)}
          </span>
        ))}
      </div>

      {/* 右侧任务区（可拖拽创建 / 任务块可移动、调整） */}
      <div
        ref={taskAreaRef}
        onMouseDown={handleMouseDown}
        className="relative flex-1 cursor-crosshair select-none"
        style={{ height: totalHeight }}
      >
        {/* 吸附粒度细线 */}
        {minorTicks.map((m) => (
          <div
            key={m}
            className="absolute left-0 right-0 border-t border-neutral-100"
            style={{ top: minutesToY(m, config) }}
          />
        ))}

        {/* 整点线 */}
        {hours.map((m) => (
          <div
            key={m}
            className="absolute left-0 right-0 border-t border-neutral-200"
            style={{ top: minutesToY(m, config) }}
          />
        ))}

        {/* 任务块（可整体移动 / 调整上、下边缘） */}
        {scheduledTasks.map((task) => {
          const isPreviewing = blockPreview?.taskId === task.id;
          const overlaps = overlappingIds.has(task.id);
          const startMs = isPreviewing ? blockPreview.startMs : task.plannedStart!;
          const endMs = isPreviewing ? blockPreview.endMs : task.plannedEnd!;
          // 范围外任务夹取 / 隐藏（B4）
          const clamped = clampBlockY(
            timeToY(startMs, config),
            timeToY(endMs, config),
            totalHeight,
          );
          if (!clamped) return null;
          const { top, height } = clamped;
          return (
            <div
              key={task.id}
              onMouseDown={(e) => startMove(e, task)}
              className={`absolute left-1 right-1 cursor-grab overflow-hidden rounded text-xs active:cursor-grabbing ${
                overlaps
                  ? "bg-amber-100 text-amber-900 ring-2 ring-amber-500 hover:bg-amber-200"
                  : "bg-blue-200 text-blue-900 hover:bg-blue-300"
              }`}
              style={{ top, height }}
            >
              {/* 重叠标记 */}
              {overlaps && (
                <span className="pointer-events-none absolute right-1 top-1 z-10 rounded bg-amber-500 px-1 text-[9px] font-medium text-white">
                  重叠
                </span>
              )}
              {/* 上边缘手柄（调整 plannedStart） */}
              <div
                onMouseDown={(e) => startResize(e, task, "start")}
                className="absolute left-0 right-0 top-0 z-10 h-2 cursor-ns-resize"
              />
              <div className="px-2 py-1">{task.title}</div>
              {/* 下边缘手柄（调整 plannedEnd） */}
              <div
                onMouseDown={(e) => startResize(e, task, "end")}
                className="absolute bottom-0 left-0 right-0 z-10 h-2 cursor-ns-resize"
              />
              {/* 实时时间（移动/resize 时显示） */}
              {isPreviewing && (
                <span className="absolute left-0 top-1/2 z-20 -translate-y-1/2 whitespace-nowrap bg-blue-500 px-1 text-[10px] text-white">
                  {formatTimeRange(startMs, endMs)}
                </span>
              )}
            </div>
          );
        })}

        {/* 拖拽创建预览区域 */}
        {preview && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 border-2 border-blue-500 bg-blue-500/20"
            style={{
              top: minutesToY(preview.startMinutes, config),
              height:
                minutesToY(preview.endMinutes, config) -
                minutesToY(preview.startMinutes, config),
            }}
          >
            <span className="absolute left-0 -translate-y-full whitespace-nowrap bg-blue-500 px-1 text-[10px] text-white">
              {formatMinutes(preview.startMinutes)} -{" "}
              {formatMinutes(preview.endMinutes)}
            </span>
          </div>
        )}

        {/* 当前时间线（实时） */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500"
            style={{ top: timeToY(now, config) }}
          >
            <span className="absolute left-0 -translate-y-full bg-red-500 px-1 text-[10px] text-white">
              {nowLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
