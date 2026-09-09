import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Play, ShieldAlert, X } from "lucide-react";
import type { WorkflowCapability, WorkflowPlan, WorkflowVariableValues } from "../../domain/types";
import { validateVariableValues } from "../../domain/variables";
import { workflowRunnerV2Host } from "../../runnerHost";
import type { WorkflowRunDetailV2 } from "../../services/workflowRunnerV2";
import type { WorkflowTemplate } from "../../templates/templateService";
import { workflowSystemBridge } from "../../systemBridge";
import { EffectPreview } from "./EffectPreview";
import { RunProgress } from "./RunProgress";
import { VariableForm } from "./VariableForm";

export interface WorkflowRunDialogRunner {
  plan(workflowId: string, variables: WorkflowVariableValues): Promise<WorkflowPlan>;
  start(input: { workflowId: string; variables: WorkflowVariableValues; taskId?: number | null }): Promise<WorkflowRunDetailV2>;
  resume(runId: string): Promise<WorkflowRunDetailV2>;
  retry(runId: string): Promise<WorkflowRunDetailV2>;
  confirmFinish(runId: string): Promise<WorkflowRunDetailV2>;
}

type Stage = "variables" | "preview" | "running" | "result";

function defaultValues(template: WorkflowTemplate): WorkflowVariableValues {
  return Object.fromEntries(
    template.variables
      .filter((definition) => definition.defaultValue !== undefined)
      .map((definition) => [definition.key, definition.defaultValue!]),
  );
}

function fieldErrors(template: WorkflowTemplate, values: WorkflowVariableValues): Record<string, string> {
  const result = validateVariableValues(template.variables, values);
  return Object.fromEntries(
    result.issues.filter((issue) => issue.field).map((issue) => [issue.field!, issue.message]),
  );
}

export function WorkflowRunDialog({
  template,
  runner = workflowRunnerV2Host,
  availableCapabilities,
  taskId = null,
  onClose,
  onOpenTarget = (path) => workflowSystemBridge.openFolder(path),
}: {
  template: WorkflowTemplate;
  runner?: WorkflowRunDialogRunner;
  availableCapabilities?: WorkflowCapability[];
  taskId?: number | null;
  onClose: () => void;
  onOpenTarget?: (path: string) => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>("variables");
  const [values, setValues] = useState<WorkflowVariableValues>(() => defaultValues(template));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [detail, setDetail] = useState<WorkflowRunDetailV2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [commandConfirmed, setCommandConfirmed] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const missingCapabilities = useMemo(
    () => plan && availableCapabilities
      ? plan.requiredCapabilities.filter((capability) => !availableCapabilities.includes(capability))
      : [],
    [availableCapabilities, plan],
  );
  const hasCommand = plan?.effects.some((effect) => effect.kind === "execute-process") === true;
  const affectedPaths = detail?.steps.flatMap((step) => {
    const value = step.output?.affectedPaths;
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === "string") : [];
  }) ?? [];

  const preview = async () => {
    const nextErrors = fieldErrors(template, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    setGlobalError(null);
    try {
      const next = await runner.plan(template.id, values);
      setPlan(next);
      setStage("preview");
    } catch (reason) {
      setGlobalError(reason instanceof Error ? reason.message : "预览失败");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setGlobalError(null);
    setStage("running");
    try {
      const next = await runner.start({ workflowId: template.id, variables: values, taskId });
      setDetail(next);
      setStage("result");
    } catch (reason) {
      setGlobalError(reason instanceof Error ? reason.message : "运行失败");
      setStage("result");
    } finally {
      setBusy(false);
    }
  };

  const continueRun = async (action: "retry" | "resume" | "confirmFinish") => {
    if (!detail) return;
    setBusy(true);
    setGlobalError(null);
    try {
      const next = await runner[action](detail.run.id);
      setDetail(next);
    } catch (reason) {
      setGlobalError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="workflow-run-title" className="mx-auto mt-[3vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border-subtle bg-bg-elevated shadow-popover">
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-strong">{stage === "variables" ? "1 / 4 · 参数" : stage === "preview" ? "2 / 4 · 影响预览" : stage === "running" ? "3 / 4 · 执行" : "4 / 4 · 结果"}</p>
            <h2 id="workflow-run-title" className="mt-1 text-lg font-semibold text-text-primary">{template.name}</h2>
          </div>
          <button type="button" aria-label="关闭运行面板" onClick={onClose} className="grid size-10 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X size={18} /></button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-6">
          {stage === "variables" && <VariableForm definitions={template.variables} values={values} errors={errors} onChange={(key, value) => { setValues((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); }} />}
          {stage === "preview" && plan && <>
            <EffectPreview plan={plan} missingCapabilities={missingCapabilities} />
            {hasCommand && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-text-secondary">
              <input type="checkbox" checked={commandConfirmed} onChange={(event) => setCommandConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
              <span><strong className="flex items-center gap-1.5 text-text-primary"><ShieldAlert size={15} />确认执行命令</strong><span className="mt-1 block text-xs leading-5 text-text-muted">我已检查可执行程序、参数和工作目录。</span></span>
            </label>}
          </>}
          {stage === "running" && <RunProgress detail={detail} busy={busy} onRetry={() => void continueRun("retry")} onResume={() => void continueRun("resume")} onConfirm={() => void continueRun("confirmFinish")} />}
          {stage === "result" && <>
            {globalError && <p role="alert" className="mb-4 rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{globalError}</p>}
            <RunProgress detail={detail} busy={busy} onRetry={() => void continueRun("retry")} onResume={() => void continueRun("resume")} onConfirm={() => void continueRun("confirmFinish")} />
            {(globalError || detail?.run.state === "failed") && <button type="button" onClick={() => setStage("variables")} className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 text-sm text-text-secondary hover:bg-surface-hover"><ArrowLeft size={14} />修改参数</button>}
            {detail?.run.state === "completed" && <div className="mt-5 rounded-xl border border-success/20 bg-success-soft p-4">
              <p className="text-sm font-medium text-success">Workflow 已完成</p>
              {affectedPaths[0] && <button type="button" onClick={() => void onOpenTarget(affectedPaths[0])} className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-success/25 bg-surface px-3 text-sm text-text-primary"><ExternalLink size={14} />打开目标目录</button>}
            </div>}
          </>}
        </div>

        {(stage === "variables" || stage === "preview") && <footer className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          {stage === "preview" ? <button type="button" onClick={() => setStage("variables")} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm text-text-secondary hover:bg-surface-hover"><ArrowLeft size={14} />返回修改</button> : <span />}
          {stage === "variables" ? <button type="button" disabled={busy} onClick={() => void preview()} className="min-h-10 cursor-pointer rounded-xl bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">{busy ? "正在预览…" : "预览操作"}</button> : <button type="button" disabled={busy || !plan?.executable || missingCapabilities.length > 0 || (hasCommand && !commandConfirmed)} onClick={() => void start()} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"><Play size={14} fill="currentColor" />确认并运行</button>}
        </footer>}
      </section>
    </div>
  );
}
