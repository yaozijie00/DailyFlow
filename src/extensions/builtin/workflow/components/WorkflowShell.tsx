import type { ReactNode } from "react";
import { Blocks, Library, PlaySquare, Plus, Workflow } from "lucide-react";
import type { WorkflowTopView } from "../store/workflowUiStore";

const tabs: Array<{ id: WorkflowTopView; label: string; icon: typeof Library }> = [
  { id: "library", label: "模板库", icon: Library },
  { id: "editor", label: "编辑器", icon: Blocks },
  { id: "runs", label: "运行中心", icon: PlaySquare },
];

export function WorkflowShell({
  view,
  onViewChange,
  onCreate,
  children,
}: {
  view: WorkflowTopView;
  onViewChange: (view: WorkflowTopView) => void;
  onCreate?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="df-workflow-shell mx-auto flex min-h-[calc(100vh-7.5rem)] w-full max-w-[90rem] flex-col overflow-hidden rounded-[1.25rem] border border-border-subtle bg-surface shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
      <header className="relative overflow-hidden border-b border-border-subtle px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent-soft text-accent-strong shadow-sm">
              <Workflow size={20} strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold tracking-[-0.02em] text-text-primary">Workflow Studio</h1>
                <span className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Beta</span>
              </div>
              <p className="mt-0.5 text-xs leading-5 text-text-muted">把重复步骤保存成可预览、可恢复的个人自动化。</p>
            </div>
          </div>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-text-primary px-4 text-sm font-medium text-bg-app shadow-sm transition-colors duration-200 hover:bg-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <Plus size={16} />
              新建自动化
            </button>
          )}
        </div>

        <nav aria-label="Workflow 主视图" className="relative mt-5 flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onViewChange(tab.id)}
                className={`inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>
      <div className="min-h-0 flex-1 bg-bg-app/45 p-4 sm:p-6">{children}</div>
    </section>
  );
}
