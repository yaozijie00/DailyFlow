import { AlertCircle, Check, Circle, LoaderCircle, Pause, RotateCcw } from "lucide-react";
import type { WorkflowRunDetailV2 } from "../../services/workflowRunnerV2";

export function RunProgress({ detail, busy, onRetry, onResume, onConfirm }: {
  detail: WorkflowRunDetailV2 | null;
  busy: boolean;
  onRetry: () => void;
  onResume: () => void;
  onConfirm: () => void;
}) {
  if (!detail) return <div aria-label="正在启动" className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-accent" size={28} /></div>;
  return (
    <div>
      <ol className="space-y-2">
        {detail.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-3">
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${step.state === "completed" ? "bg-success-soft text-success" : step.state === "failed" ? "bg-danger-soft text-danger" : step.state === "running" ? "bg-accent-soft text-accent-strong" : "bg-surface-muted text-text-faint"}`}>
              {step.state === "completed" ? <Check size={13} /> : step.state === "failed" ? <AlertCircle size={13} /> : step.state === "running" ? <LoaderCircle className="animate-spin" size={13} /> : <Circle size={10} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{step.nodeType}</p>
              {step.error && <p className="mt-1 text-xs text-danger">{step.error.message}</p>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end gap-2">
        {detail.run.state === "failed" && detail.steps.some((step) => step.error?.retryable) && <button type="button" disabled={busy} onClick={onRetry} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm text-on-accent disabled:opacity-50"><RotateCcw size={14} />重试失败步骤</button>}
        {detail.run.state === "paused" && <button type="button" disabled={busy} onClick={onResume} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm text-on-accent disabled:opacity-50"><Pause size={14} />确认并继续</button>}
        {detail.run.state === "awaiting-confirm" && <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm text-on-accent disabled:opacity-50"><Check size={14} />确认完成任务</button>}
      </div>
    </div>
  );
}
