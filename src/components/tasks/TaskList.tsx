import { Check, Circle } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { formatDuration } from "../../lib/format";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";

export default function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const completeTask = useTaskStore((s) => s.completeTask);
  const selectTask = useTaskStore((s) => s.selectTask);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

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
              onClick={() => selectTask(task.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                selected
                  ? "border-neutral-900 bg-neutral-50"
                  : "border-transparent hover:bg-neutral-100"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!done && !cancelled) completeTask(task.id);
                }}
                className="text-neutral-400 hover:text-green-600"
                aria-label="完成任务"
              >
                {done ? (
                  <Check size={18} className="text-green-600" />
                ) : (
                  <Circle size={18} />
                )}
              </button>
              <span className="flex-1">
                <span
                  className={`block text-sm ${
                    done || cancelled
                      ? "text-neutral-400 line-through"
                      : "text-neutral-900"
                  }`}
                >
                  {task.title}
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
