import { AlertTriangle, CheckCircle2, FilePlus2, FolderPlus, Link, Rocket, ShieldCheck, Terminal } from "lucide-react";
import type { PlannedEffect, WorkflowCapability, WorkflowPlan } from "../../domain/types";

const conflictLabels: Record<string, string> = {
  none: "无冲突",
  fail: "存在时停止",
  skip: "存在时跳过",
  overwrite: "覆盖已有内容",
  rename: "自动重命名",
};

function EffectIcon({ effect }: { effect: PlannedEffect }) {
  if (effect.kind === "create-directory") return <FolderPlus size={16} />;
  if (effect.kind === "create-file" || effect.kind === "copy-path") return <FilePlus2 size={16} />;
  if (effect.kind === "launch-process") return <Rocket size={16} />;
  if (effect.kind === "execute-process") return <Terminal size={16} />;
  return <Link size={16} />;
}

export function EffectPreview({ plan, missingCapabilities }: {
  plan: WorkflowPlan;
  missingCapabilities: WorkflowCapability[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-subtle bg-surface-muted/70 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary"><ShieldCheck size={16} className="text-accent-strong" />需要的能力</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {plan.requiredCapabilities.length === 0 ? <span className="text-xs text-text-muted">无需额外能力</span> : plan.requiredCapabilities.map((capability) => (
            <span key={capability} className={`rounded-full px-2.5 py-1 text-xs ${missingCapabilities.includes(capability) ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>{capability}</span>
          ))}
        </div>
        {missingCapabilities.length > 0 && <p role="alert" className="mt-2 text-xs text-danger">缺少能力：{missingCapabilities.join("、")}</p>}
      </div>

      {plan.issues.length > 0 && <div className="space-y-2">{plan.issues.map((issue, index) => (
        <div key={`${issue.code}-${index}`} className={`flex gap-2 rounded-xl border p-3 text-xs ${issue.severity === "error" ? "border-danger/20 bg-danger-soft text-danger" : "border-warning/20 bg-warning-soft text-warning"}`}>
          <AlertTriangle size={15} className="shrink-0" /> {issue.message}
        </div>
      ))}</div>}

      <div>
        <h3 className="text-sm font-medium text-text-primary">将执行 {plan.effects.length} 项操作</h3>
        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
          {plan.effects.map((effect) => (
            <li key={effect.id} className="flex gap-3 rounded-xl border border-border-subtle bg-surface p-3">
              <span className="mt-0.5 text-text-muted"><EffectIcon effect={effect} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{effect.title}</p>
                {effect.target && <p className="mt-1 break-all font-mono text-[11px] leading-5 text-text-muted">{effect.target}</p>}
                {effect.conflict && <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[10px] ${effect.conflict === "overwrite" ? "bg-danger-soft text-danger" : "bg-surface-muted text-text-muted"}`}>冲突策略：{conflictLabels[effect.conflict]}</span>}
              </div>
              {effect.conflict === "none" && <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
