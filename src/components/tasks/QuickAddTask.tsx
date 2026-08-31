import { useState } from "react";
import { Plus } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";

/** 任务列表顶部快速创建：输入标题回车即创建，可带分类与预计时长（均可留空）。 */
export default function QuickAddTask() {
  const categories = useTaskStore((s) => s.categories);
  const createTask = useTaskStore((s) => s.createTask);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minutes, setMinutes] = useState("");

  const canSubmit = title.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const m = Number(minutes);
    await createTask({
      title: title.trim(),
      categoryId: categoryId === "" ? null : Number(categoryId),
      estimatedDuration:
        minutes === "" || !Number.isFinite(m) || m < 0 ? null : Math.round(m * 60),
    });
    setTitle("");
    setMinutes("");
  };

  return (
    <div className="mb-2 space-y-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="快速添加任务，回车创建"
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <label htmlFor="qa-category" className="shrink-0">
          分类
        </label>
        <select
          id="qa-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
        >
          <option value="">未分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label htmlFor="qa-minutes" className="shrink-0">
          时长
        </label>
        <input
          id="qa-minutes"
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="分钟"
          className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="flex items-center justify-center rounded-md bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300"
          aria-label="添加任务"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
