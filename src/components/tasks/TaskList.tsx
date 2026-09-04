import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Circle, GripVertical, StickyNote } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { useNoteStore } from "../../stores/noteStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { useTaskToNoteDrag } from "../../hooks/useTaskToNoteDrag";
import type { Task } from "../../db/repositories/taskRepository";
import {
  convertNoteToTask,
  noteDragSession,
  noteDropCallbacks,
  noteDropZoneAt,
} from "../../lib/noteConvert";
import { undoManager } from "../../lib/undoManager";
import { formatDuration } from "../../lib/format";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";
import { TASK_PRIORITIES, taskPriorityMeta } from "../../lib/taskPriority";

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
  const hideCompleted = useSettingsStore((s) => s.settings.todayHideCompleted);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    hideCompleted ? "todo" : "all",
  );
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // 设置「默认隐藏已完成」：开启时若仍处于「全部」，自动切到待办
  useEffect(() => {
    if (hideCompleted) {
      setStatusFilter((prev) => (prev === "all" ? "todo" : prev));
    }
  }, [hideCompleted]);

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

  /** 上下拖动：把 fromId 移到 beforeId 之前（始终按完整列表顺序重排，避免筛选下打乱全局顺序）。 */
  function moveTask(fromId: number, beforeId: number) {
    const ids = tasks.map((t) => t.id);
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

  /** 注册投放回调：便签松手在列表上 → 转今日任务（无时间块），作为一次 Undo 复合操作。 */
  useEffect(() => {
    noteDropCallbacks.tasklist = (noteId) => {
      void undoManager.withBatchAsync(() => convertNoteToTask(noteId, notes, createTask, updateNote));
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
    if (priorityFilter !== "") {
      list = list.filter((t) => taskPriorityMeta(t.priority).value === priorityFilter);
    }
    return list;
  }, [tasks, statusFilter, categoryFilter, priorityFilter]);

  /** 「全部」无分类/优先级过滤时按父子分组展示：子任务折叠在父任务下，不单独成行。 */
  const flatAll =
    statusFilter === "all" && categoryFilter === "" && priorityFilter === "";
  const displayTasks = flatAll ? tasks.filter((t) => t.parentId == null) : filteredTasks;

  return (
    <div
      data-note-drop="tasklist"
      className={`space-y-1.5 rounded-md transition-shadow ${
        noteOver ? "shadow-[inset_0_0_0_2px_#f59e0b66]" : ""
      }`}
    >
      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
          暂无任务，点击右上角「新建任务」或按 Ctrl+N 开始规划
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
            <div className="flex gap-1.5">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
              >
                <option value="">全部分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {/* 优先级筛选（与分类并排，不额外占行高） */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                aria-label="按优先级筛选"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
              >
                <option value="">全部优先级</option>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {displayTasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
              无匹配的任务
            </p>
          ) : (
            <ul className="space-y-1">
              {displayTasks.map((task) => {
                const done = task.status === "COMPLETED";
                const cancelled = task.status === "CANCELLED";
                const selected = task.id === selectedTaskId;
                const pMeta = taskPriorityMeta(task.priority);
                const childTasks = flatAll ? tasks.filter((t) => t.parentId === task.id) : [];
                const childDone = childTasks.filter((c) => c.status === "COMPLETED").length;
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
                      {/* 优先级标签 */}
                      <span
                        className="shrink-0 rounded px-1 py-px text-[10px] font-medium leading-tight"
                        style={{ color: pMeta.text, backgroundColor: pMeta.bg }}
                        title={`优先级：${pMeta.label}`}
                      >
                        {pMeta.label}
                      </span>
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
                          {childTasks.length > 0
                            ? `${task.categoryId != null || task.estimatedDuration != null ? " · " : ""}子任务 ${childDone}/${childTasks.length}`
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
                        className="shrink-0 cursor-grab text-neutral-400 transition-colors hover:text-neutral-700"
                        title="拖动手柄调整顺序（拖动整行是拖入时间轴）"
                      >
                        <GripVertical size={14} />
                      </span>
                    </div>

                    {/* 子任务折叠区（全部视图） */}
                    {childTasks.length > 0 && (
                      <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-neutral-100 pl-3">
                        {childTasks.map((child) => {
                          const childDone_ = child.status === "COMPLETED";
                          return (
                            <li key={child.id}>
                              <div
                                onClick={() => selectTask(child.id)}
                                className={`flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 ${
                                  child.id === selectedTaskId
                                    ? "bg-neutral-100"
                                    : "hover:bg-neutral-50"
                                }`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (child.status !== "CANCELLED") toggleComplete(child.id);
                                  }}
                                  aria-label={childDone_ ? "恢复为未完成" : "完成子任务"}
                                  title={childDone_ ? "恢复为未完成" : "完成子任务"}
                                  className="shrink-0 text-neutral-400 hover:text-green-600"
                                >
                                  {childDone_ ? (
                                    <Check size={15} className="text-green-600" />
                                  ) : (
                                    <Circle size={15} />
                                  )}
                                </button>
                                <span
                                  className={`min-w-0 flex-1 truncate text-sm ${
                                    child.status === "COMPLETED" ||
                                    child.status === "CANCELLED"
                                      ? "text-neutral-400 line-through decoration-neutral-300"
                                      : "text-neutral-800"
                                  }`}
                                >
                                  {child.title}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
