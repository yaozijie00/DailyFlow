import { useEffect, useState } from "react";
import { Play, Sparkles, X } from "lucide-react";
import type { ExtensionTaskContext } from "../../../types";
import { workflowService } from "../services/workflowService";
import type { WorkflowTemplate, WorkflowTemplateQuery } from "../templates/templateService";
import { WorkflowRunDialog, type WorkflowRunDialogRunner } from "./runner/WorkflowRunDialog";

interface QuickLaunchDataSource {
  listTemplates(query?: WorkflowTemplateQuery): Promise<WorkflowTemplate[]>;
}

function useTemplates(dataSource: QuickLaunchDataSource, enabled = true) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    dataSource.listTemplates({ sort: "recent" }).then(
      (items) => { if (alive) setTemplates([...items].sort((a, b) => Number(b.favorite) - Number(a.favorite)).slice(0, 5)); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [dataSource, enabled]);
  return { templates, failed };
}

export function WorkflowQuickLaunch({ dataSource = workflowService, runner }: {
  dataSource?: QuickLaunchDataSource;
  runner?: WorkflowRunDialogRunner;
}) {
  const { templates, failed } = useTemplates(dataSource);
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
  if (failed || templates.length === 0) return null;
  return <section aria-label="Workflow 快捷启动" className="rounded-xl border border-border-subtle bg-surface/70 px-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary"><Sparkles size={14} className="text-accent" />快捷自动化</span>
      {templates.slice(0, 3).map((template) => <button key={template.id} type="button" onClick={() => setSelected(template)} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-xs text-text-secondary hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Play size={12} />{template.name}</button>)}
    </div>
    {selected && <WorkflowRunDialog template={selected} {...(runner ? { runner } : {})} onClose={() => setSelected(null)} />}
  </section>;
}

export function WorkflowTaskAction({ task, dataSource = workflowService, runner }: {
  task: ExtensionTaskContext;
  dataSource?: QuickLaunchDataSource;
  runner?: WorkflowRunDialogRunner;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
  const { templates, failed } = useTemplates(dataSource, open);
  if (failed) return null;
  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent/25 bg-accent-soft px-3 text-sm text-accent-strong hover:border-accent"><Sparkles size={14} />运行 Workflow</button>
    {open && <div role="dialog" aria-label={`为“${task.title}”选择 Workflow`} className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-xl border border-border-subtle bg-bg-elevated p-2 shadow-popover">
      <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-medium text-text-secondary">选择自动化模板</span><button type="button" aria-label="关闭 Workflow 菜单" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-text-faint hover:bg-surface-hover"><X size={14} /></button></div>
      {templates.length === 0 ? <p className="px-2 py-4 text-center text-xs text-text-muted">正在读取模板…</p> : templates.map((template) => <button key={template.id} type="button" onClick={() => { setSelected(template); setOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-text-secondary hover:bg-surface-hover"><Play size={13} className="text-accent" /><span className="truncate">{template.name}</span></button>)}
    </div>}
    {selected && <WorkflowRunDialog template={selected} {...(runner ? { runner } : {})} taskId={task.id} onClose={() => setSelected(null)} />}
  </div>;
}

