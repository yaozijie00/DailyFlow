import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ValidationIssue } from "../../domain/types";

export function ValidationPanel({ issues, onSelectNode }: {
  issues: ValidationIssue[];
  onSelectNode: (nodeId: string) => void;
}) {
  if (issues.length === 0) return <div className="flex min-h-10 items-center gap-2 border-t border-border-subtle bg-surface px-4 text-xs text-success"><CheckCircle2 size={14} />结构有效，可以保存或试运行。</div>;
  return (
    <div className="max-h-32 overflow-y-auto border-t border-border-subtle bg-surface px-3 py-2">
      <div className="flex flex-wrap gap-2">{issues.map((issue, index) => <button key={`${issue.code}-${index}`} type="button" disabled={!issue.nodeId} onClick={() => issue.nodeId && onSelectNode(issue.nodeId)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-left text-xs ${issue.severity === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"} ${issue.nodeId ? "cursor-pointer" : "cursor-default"}`}><AlertTriangle size={12} />{issue.message}</button>)}</div>
    </div>
  );
}
