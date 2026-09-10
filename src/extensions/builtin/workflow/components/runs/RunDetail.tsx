import { Check, Circle, CircleAlert, ExternalLink, LoaderCircle, Pause, RotateCcw, Square } from "lucide-react";
import type { WorkflowRunDetail as RunDetailModel } from "../../services/workflowService";

function affectedPaths(detail: RunDetailModel): string[] {
  return detail.steps.flatMap((step) => {
    const value = step.output?.affectedPaths;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  });
}

export function RunDetail({ detail, busy, error, onRetry, onResume, onConfirm, onCancel, onOpenTarget }: {
  detail: RunDetailModel | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onResume: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenTarget: (path: string) => void;
}) {
  if (!detail) return <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border-strong text-sm text-text-muted">选择一条运行记录查看详情</div>;
  const nodeNames = new Map(detail.run.workflowSnapshot.nodes.map((node) => [node.id, node.title]));
  const paths = [...new Set(affectedPaths(detail))];
  const retryable = detail.steps.some((step) => step.state === "failed" && step.error?.retryable === true);
  const cancellable = ["pending", "running", "paused", "awaiting-confirm"].includes(detail.run.state);
  return <section aria-label="运行详情" className="rounded-xl border border-border-subtle bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-accent-strong">运行快照 · v{detail.run.workflowVersion}</p><h2 className="mt-1 text-base font-semibold text-text-primary">{detail.workflowName}</h2>{detail.templateDeleted && <p className="mt-1 text-xs text-text-muted">原模板已删除，以下内容来自本次运行快照。</p>}</div>
      <div className="flex flex-wrap gap-2">
        {detail.run.state === "paused" && <button type="button" disabled={busy} onClick={onResume} className="min-h-10 rounded-lg bg-accent px-3 text-sm text-on-accent"><Pause size={14} className="mr-1 inline" />继续</button>}
        {detail.run.state === "awaiting-confirm" && <button type="button" disabled={busy} onClick={onConfirm} className="min-h-10 rounded-lg bg-accent px-3 text-sm text-on-accent"><Check size={14} className="mr-1 inline" />确认完成</button>}
        {detail.run.state === "failed" && retryable && <button type="button" disabled={busy} onClick={onRetry} className="min-h-10 rounded-lg bg-accent px-3 text-sm text-on-accent"><RotateCcw size={14} className="mr-1 inline" />安全重试</button>}
        {cancellable && <button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-danger/25 px-3 text-sm text-danger"><Square size={13} className="mr-1 inline" />取消运行</button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {detail.run.error && <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{detail.run.error.message}</p>}
    <ol className="mt-4 space-y-2" aria-label="步骤时间线">
      {detail.steps.map((step) => <li key={step.id} className="flex gap-3 rounded-lg border border-border-subtle bg-bg-app/60 p-3">
        <span className="mt-0.5">{step.state === "completed" ? <Check size={15} className="text-success" /> : step.state === "failed" ? <CircleAlert size={15} className="text-danger" /> : step.state === "running" ? <LoaderCircle size={15} className="animate-spin text-accent" /> : <Circle size={13} className="text-text-faint" />}</span>
        <div className="min-w-0"><p className="text-sm font-medium text-text-primary">{nodeNames.get(step.nodeId) ?? step.nodeType}</p><p className="mt-0.5 text-xs text-text-muted">{step.state}</p>{step.error && <p className="mt-1 text-xs text-danger">{step.error.message}</p>}</div>
      </li>)}
    </ol>
    {paths.length > 0 && <div className="mt-5 border-t border-border-subtle pt-4"><h3 className="text-xs font-semibold text-text-secondary">实际结果</h3><div className="mt-2 flex flex-wrap gap-2">{paths.map((path) => <button key={path} type="button" onClick={() => onOpenTarget(path)} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-border-strong px-3 text-xs text-text-secondary hover:bg-surface-hover"><ExternalLink size={13} /><span className="truncate">{path}</span></button>)}</div></div>}
  </section>;
}

