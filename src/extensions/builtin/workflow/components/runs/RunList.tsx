import { CheckCircle2, CircleAlert, Clock3, LoaderCircle, PauseCircle } from "lucide-react";
import type { WorkflowRunDetail } from "../../services/workflowService";

const stateLabel = {
  pending: "等待开始",
  running: "运行中",
  paused: "已暂停",
  "awaiting-confirm": "等待确认",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
} as const;

function StateIcon({ state }: { state: WorkflowRunDetail["run"]["state"] }) {
  if (state === "completed") return <CheckCircle2 size={16} className="text-success" />;
  if (state === "failed") return <CircleAlert size={16} className="text-danger" />;
  if (state === "paused" || state === "awaiting-confirm") return <PauseCircle size={16} className="text-warning" />;
  if (state === "running") return <LoaderCircle size={16} className="animate-spin text-accent" />;
  return <Clock3 size={16} className="text-text-faint" />;
}

export function RunList({ items, selectedId, onSelect }: {
  items: WorkflowRunDetail[];
  selectedId: string | null;
  onSelect: (detail: WorkflowRunDetail) => void;
}) {
  return <ul aria-label="运行记录" className="space-y-2">
    {items.map((detail) => <li key={detail.run.id}>
      <button type="button" onClick={() => onSelect(detail)} className={`flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selectedId === detail.run.id ? "border-accent bg-accent-soft/60" : "border-border-subtle bg-surface hover:border-border-strong hover:bg-surface-hover"}`}>
        <StateIcon state={detail.run.state} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{detail.workflowName}</span><span className="mt-1 block text-xs text-text-muted">{stateLabel[detail.run.state]} · {new Date(detail.run.createdAt).toLocaleString()}</span>{detail.templateDeleted && <span className="mt-1 block text-[10px] text-text-faint">模板已删除 · 来自运行快照</span>}</span>
      </button>
    </li>)}
  </ul>;
}

