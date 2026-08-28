import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { formatTimeRange } from "../../lib/timeline";

export default function TaskFormModal() {
  const isCreateOpen = useTaskStore((s) => s.isCreateOpen);
  const editingTaskId = useTaskStore((s) => s.editingTaskId);
  const createDraft = useTaskStore((s) => s.createDraft);
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const closeCreate = useTaskStore((s) => s.closeCreate);
  const closeEdit = useTaskStore((s) => s.closeEdit);

  const editingTask =
    editingTaskId != null ? tasks.find((t) => t.id === editingTaskId) : undefined;
  const open = isCreateOpen || editingTaskId != null;

  const hasDraft =
    createDraft?.plannedStart != null && createDraft?.plannedEnd != null;

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setCategoryId(editingTask.categoryId != null ? String(editingTask.categoryId) : "");
      // 用十进制分钟展示，避免子分钟精度丢失（如 90 秒 → "1.5"）
      setEstimatedMinutes(
        editingTask.estimatedDuration != null
          ? String(editingTask.estimatedDuration / 60)
          : "",
      );
    } else if (hasDraft) {
      setTitle("");
      setCategoryId("");
      setEstimatedMinutes(
        String((createDraft.plannedEnd! - createDraft.plannedStart!) / 60000),
      );
    } else {
      setTitle("");
      setCategoryId("");
      setEstimatedMinutes("");
    }
  }, [editingTaskId, isCreateOpen, editingTask, createDraft, hasDraft]);

  if (!open) return null;

  const close = () => {
    if (editingTask) closeEdit();
    else closeCreate();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    const estimated = estimatedMinutes === "" ? null : Number(estimatedMinutes);
    const payload = {
      title: trimmed,
      categoryId: categoryId === "" ? null : Number(categoryId),
      estimatedDuration:
        estimated == null || Number.isNaN(estimated) || estimated < 0
          ? null
          : Math.round(estimated * 60),
      ...(hasDraft
        ? {
            plannedStart: createDraft.plannedStart,
            plannedEnd: createDraft.plannedEnd,
          }
        : {}),
    };

    if (editingTask) {
      await updateTask(editingTask.id, payload);
    } else {
      await createTask(payload);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editingTask ? "编辑任务" : "创建任务"}
          </h2>
          <button onClick={close} className="text-neutral-400 hover:text-neutral-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasDraft && (
            <div>
              <label className="mb-1 block text-sm text-neutral-600">任务时间</label>
              <div className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-900">
                {formatTimeRange(createDraft.plannedStart!, createDraft.plannedEnd!)}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-neutral-600">任务名称</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="例如：写代码"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">类别</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">无</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">预计时间（分钟）</label>
            <input
              type="number"
              min={0}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="例如：90"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
            >
              {editingTask ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
