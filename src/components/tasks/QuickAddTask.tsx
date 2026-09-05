import { useState } from "react";
import { Plus } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";

/** 任务列表顶部快速创建：仅输入标题回车即创建（分类/时长在完整弹窗里设置）。 */
export default function QuickAddTask() {
  const createTask = useTaskStore((s) => s.createTask);
  const [title, setTitle] = useState("");

  const canSubmit = title.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    await createTask({ title: title.trim() });
    setTitle("");
  };

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="快速添加任务，回车创建"
          className="w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary placeholder:text-text-faint outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="flex shrink-0 items-center justify-center rounded-md bg-accent px-2 py-1.5 text-sm text-on-accent hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-faint"
          aria-label="添加任务"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
