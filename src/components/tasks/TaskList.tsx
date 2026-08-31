import { useRef } from "react";
import { Check, Circle } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import type { Task } from "../../db/repositories/taskRepository";
import { formatDuration } from "../../lib/format";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";

export default function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const selectTask = useTaskStore((s) => s.selectTask);
  const startTaskDrag = useTaskStore((s) => s.startTaskDrag);
  const endTaskDrag = useTaskStore((s) => s.endTaskDrag);
  const { start: startWindowDrag } = useWindowDrag();
  const didDragRef = useRef(false);

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

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const colorMap = new Map(categories.map((c) => [c.id, c.color ?? NO_CATEGORY_COLOR]));

  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
        暂无任务，点击右上角「新建任务」开始规划
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {tasks.map((task) => {
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
              <span className="flex-1">
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
                    className={`block text-sm ${
                      done || cancelled
                        ? "text-neutral-400 line-through"
                        : "text-neutral-900"
                    }`}
                  >
                    {task.title}
                  </span>
                </span>
                <span className="block text-xs text-neutral-500">
                  {task.categoryId != null
                    ? (categoryMap.get(task.categoryId) ?? "")
                    : ""}
                  {task.estimatedDuration != null
                    ? `${task.categoryId != null ? " · " : ""}${formatDuration(task.estimatedDuration)}`
                    : ""}
                </span>
              </span>
              <span className="text-xs text-neutral-400">
                {TASK_STATUS_LABEL[task.status] ?? task.status}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
