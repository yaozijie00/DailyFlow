import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, GripVertical, StickyNote } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { useNoteStore } from "../../stores/noteStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { useTaskToNoteDrag } from "../../hooks/useTaskToNoteDrag";
import type { Task } from "../../db/repositories/taskRepository";
import {
  convertNoteToTask,
  noteDragSession,
  noteDropCallbacks,
  noteDropZoneAt,
} from "../../lib/noteConvert";
import { formatDuration } from "../../lib/format";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";

type StatusFilter = "all" | "todo" | "done";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "todo", label: "待办" },
  { key: "done", label: "已完成" },
];

export default function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const selectTask = useTaskStore((s) => s.selectTask);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);
  const createTask = useTaskStore((s) => s.createTask);
  const notes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.update);
  const startTaskDrag = useTaskStore((s) => s.startTaskDrag);
  const endTaskDrag = useTaskStore((s) => s.endTaskDrag);
  const { start: startWindowDrag } = useWindowDrag();
  const startTaskToNoteDrag = useTaskToNoteDrag();
  const didDragRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  /** 行内按下：位移超过阈值进入「拖入时间轴」拖拽；否则保持点击选择。 */
  function beginDrag(e: React.MouseEvent, task: Task) {
    didDragRef.current = false;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // 完成任务按钮不触发拖拽
    e.preventDefault(); // 阻止拖拽过程中选中列表文字
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    startWindowDrag(
      {
        onMove: (ev) => {
          if (dragging) return;
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) {
            dragging = true;
            didDragRef.current = true;
            startTaskDrag(task.id); // 时间轴据此显示 Ghost Preview，松开时由其保存
          }
        },
        onUp: () => {
          // 拖拽结束的保存/取消由 Timeline 的拖拽监听处理
        },
      },
      () => {
        if (dragging) endTaskDrag();
      },
    );
  }

  /** 上下拖动：把 fromId 移到 beforeId 之前（按当前筛选后的显示顺序重排）。 */
  function moveTask(fromId: number, beforeId: number) {
    const ids = filteredTasks.map((t) => t.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(beforeId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    const target = ids.indexOf(beforeId);
    ids.splice(target, 0, fromId);
    void reorderTasks(ids);
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const colorMap = new Map(categories.map((c) => [c.id, c.color ?? NO_CATEGORY_COLOR]));

  /** 便签拖拽悬停本列表时的高亮反馈（鼠标方案，与 HTML5 DnD 无关）。 */
  const [noteOver, setNoteOver] = useState(false);
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      setNoteOver(
        noteDragSession.noteId != null &&
          noteDropZoneAt(ev.clientX, ev.clientY) === "tasklist",
      );
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  /** 注册投放回调：便签松手在列表上 → 转今日任务（无时间块）。 */
  useEffect(() => {
    noteDropCallbacks.tasklist = (noteId) => {
      void convertNoteToTask(noteId, notes, createTask, updateNote);
    };
    return () => {
      delete noteDropCallbacks.tasklist;
    };
  }, [notes, createTask, updateNote]);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (statusFilter === "todo") list = list.filter((t) => t.status === "TODO");
    else if (statusFilter === "done") list = list.filter((t) => t.status === "COMPLETED");
    if (categoryFilter !== "") {
      list = list.filter((t) => t.categoryId === Number(categoryFilter));
    }
    return list;
  }, [tasks, statusFilter, categoryFilter]);

  return (
    <div
      data-note-drop="tasklist"
      className={`space-y-1.5 rounded-md transition-shadow ${
        noteOver ? "shadow-[inset_0_0_0_2px_#f59e0b66]" : ""
      }`}
    >
      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          暂无任务，点击右上角「新建任务」开始规划
        </div>
      ) : (
        <>
          {/* 筛选栏：状态 + 分类 */}
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    statusFilter === f.key
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {filteredTasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
              无匹配的任务
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredTasks.map((task) => {
                const done = task.status === "COMPLETED";
                const cancelled = task.status === "CANCELLED";
                const selected = task.id === selectedTaskId;
                return (
                  <li key={task.id}>
                    <div
                      onMouseDown={(e) => beginDrag(e, task)}
                      onClick={() => {
                        if (didDragRef.current) {
                          didDragRef.current = false; // 拖拽后的 click 不触发选择
                          return;
                        }
                        selectTask(task.id);
                      }}
                      className={`flex cursor-pointer select-none items-center gap-3 rounded-md border px-3 py-2 ${
                        selected
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-transparent hover:bg-neutral-100"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!cancelled) toggleComplete(task.id);
                        }}
                        className="text-neutral-400 hover:text-green-600"
                        aria-label={done ? "恢复为未完成" : "完成任务"}
                        title={done ? "恢复为未完成" : "完成任务"}
                      >
                        {done ? (
                          <Check size={18} className="text-green-600" />
                        ) : (
                          <Circle size={18} />
                        )}
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background:
                                task.categoryId != null
                                  ? (colorMap.get(task.categoryId) ?? NO_CATEGORY_COLOR)
                                  : NO_CATEGORY_COLOR,
                            }}
                          />
                          <span
                            className={`block truncate text-sm ${
                              done || cancelled
                                ? "text-neutral-400 line-through"
                                : "text-neutral-900"
                            }`}
                          >
                            {task.title}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {task.categoryId != null
                            ? (categoryMap.get(task.categoryId) ?? "")
                            : ""}
                          {task.estimatedDuration != null
                            ? `${task.categoryId != null ? " · " : ""}${formatDuration(task.estimatedDuration)}`
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {TASK_STATUS_LABEL[task.status] ?? task.status}
                      </span>
                      {/* 转为便签手柄（拖到便签区） */}
                      <span
                        onMouseDown={(e) => startTaskToNoteDrag(e, task.id)}
                        className="shrink-0 cursor-grab text-neutral-300 transition-colors hover:text-amber-500"
                        title="拖到便签区转为便签"
                        aria-label="转为便签"
                      >
                        <StickyNote size={14} />
                      </span>
                      {/* 拖动排序手柄（与「拖入时间轴」互不干扰） */}
                      <span
                        draggable
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(task.id));
                          e.stopPropagation();
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const fromId = Number(e.dataTransfer.getData("text/plain"));
                          if (Number.isFinite(fromId) && fromId !== task.id) {
                            moveTask(fromId, task.id);
                          }
                        }}
                        className="shrink-0 cursor-grab text-neutral-300 transition-colors hover:text-neutral-500"
                        title="拖动调整顺序"
                      >
                        <GripVertical size={14} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
