import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { useAppStore } from "../../../stores/appStore";
import { useWorkflowStore } from "./store/workflowStore";
import WorkflowEditorView from "./components/WorkflowEditorView";
import { getWorkflowPreferences } from "./preferences";
import { WorkflowShell } from "./components/WorkflowShell";
import { useWorkflowUiStore } from "./store/workflowUiStore";
import { TemplateLibrary } from "./components/library/TemplateLibrary";
import { WorkflowRunDialog } from "./components/runner/WorkflowRunDialog";
import type { WorkflowTemplate } from "./templates/templateService";

type ModalMode = { kind: "create" } | null;

export default function WorkflowPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const list = useWorkflowStore((s) => s.list);
  const current = useWorkflowStore((s) => s.current);
  const loadList = useWorkflowStore((s) => s.loadList);
  const load = useWorkflowStore((s) => s.load);
  const create = useWorkflowStore((s) => s.create);
  const activeRuns = useWorkflowStore((s) => s.activeRuns);
  const loadingRuns = useWorkflowStore((s) => s.loadingRuns);
  const loadActiveRuns = useWorkflowStore((s) => s.loadActiveRuns);

  const view = useWorkflowUiStore((s) => s.view);
  const editingId = useWorkflowUiStore((s) => s.selectedTemplateId);
  const navigate = useWorkflowUiStore((s) => s.navigate);
  const openEditorView = useWorkflowUiStore((s) => s.openEditor);
  const openRunnerView = useWorkflowUiStore((s) => s.openRunner);
  const closeRunnerView = useWorkflowUiStore((s) => s.closeRunner);
  const [modal, setModal] = useState<ModalMode>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [runTemplate, setRunTemplate] = useState<WorkflowTemplate | null>(null);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === "runs") void loadActiveRuns();
  }, [loadActiveRuns, view]);

  const openEditor = (id: string) => {
    openEditorView(id);
    void load(id);
  };

  // 画布视图（编辑器）
  if (view === "editor") {
    if (!current || current.id !== editingId) {
      // 加载失败/记录不存在时给出逃生出口（Phase 3：避免永久「加载中」卡死）
      return (
        <WorkflowShell view={view} onViewChange={navigate}>
          <div className="flex items-center justify-between rounded-md border border-border-subtle glass-surface p-4">
            <div className="text-sm text-text-muted">
              {current === null ? "加载中…" : "Workflow 不存在或已删除"}
            </div>
            <div className="flex items-center gap-2">
              {current === null && (
                <button
                  onClick={() => {
                    if (editingId) void load(editingId);
                  }}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
                >
                  重试
                </button>
              )}
              <button
                onClick={() => {
                  navigate("library");
                  void loadList();
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:bg-accent-hover"
              >
                返回列表
              </button>
            </div>
          </div>
        </WorkflowShell>
      );
    }
    return (
      <WorkflowShell view={view} onViewChange={navigate}>
        <div style={{ height: "calc(100vh - 260px)" }} className="min-h-[34rem] w-full">
          <WorkflowEditorView
            workflow={current}
            onBack={() => {
              navigate("library");
              void loadList();
            }}
            onSaved={() => {
              void loadList();
              if (editingId) void load(editingId);
              pushToast("success", "Workflow 已保存");
            }}
          />
        </div>
      </WorkflowShell>
    );
  }

  const openCreate = () => {
    setName("");
    setDesc("");
    setTagsText("");
    setModal({ kind: "create" });
  };

  const submit = async () => {
    const t = name.trim();
    if (!t) return;
    const tags = tagsText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (modal?.kind === "create") {
      const id = await create({ name: t, description: desc.trim() || undefined, tags });
      setModal(null);
      if (id && getWorkflowPreferences().openEditorAfterCreate) openEditor(id);
      return;
    }
    setModal(null);
  };

  const inputCls =
    "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-faint focus:border-accent";

  if (view === "runs") {
    return (
      <WorkflowShell view={view} onViewChange={navigate} onCreate={openCreate}>
        <div className="rounded-2xl border border-border-subtle bg-surface/70 p-5">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">运行中心</h2>
              <p className="mt-1 text-sm text-text-muted">继续等待确认或尚未结束的自动化。</p>
            </div>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-text-muted">{activeRuns.length} 个进行中</span>
          </div>
          {loadingRuns ? (
            <p className="py-12 text-center text-sm text-text-muted">正在读取运行记录…</p>
          ) : activeRuns.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border-strong px-6 text-center">
              <div className="max-w-md">
            <ListChecks className="mx-auto text-text-faint" size={28} />
                <h3 className="mt-3 text-sm font-semibold text-text-primary">没有待处理的运行</h3>
                <p className="mt-1 text-sm leading-6 text-text-muted">从模板库启动自动化后，可以在这里恢复和确认。</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {activeRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-app/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{list.find((item) => item.id === run.workflowId)?.name ?? "Workflow"}</p>
                    <p className="mt-0.5 text-xs text-text-muted">状态：{run.state}</p>
                  </div>
                  <button type="button" className="min-h-10 cursor-pointer rounded-lg border border-border-strong px-3 text-sm text-text-secondary hover:bg-surface-hover">继续处理</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </WorkflowShell>
    );
  }

  return (
    <WorkflowShell view={view} onViewChange={navigate} onCreate={openCreate}>

      <TemplateLibrary
        onRun={(template) => {
          setRunTemplate(template);
          openRunnerView(template.id);
        }}
        onEdit={(template) => openEditor(template.id)}
      />
      {runTemplate && (
        <WorkflowRunDialog
          template={runTemplate}
          onClose={() => {
            setRunTemplate(null);
            closeRunnerView();
          }}
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="glass-surface mx-auto mt-[6vh] w-full max-w-md rounded-lg border border-border-subtle p-6 shadow-popover">
            <h2 className="mb-4 text-lg font-semibold">
              新建 Workflow
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-sm text-text-secondary">名称</label>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="流程名称" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">描述（可选）</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="补充说明" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">标签（逗号分隔，可选）</label>
                <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputCls} placeholder="标签用逗号分隔" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover">
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent hover:bg-accent-hover disabled:opacity-40"
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </WorkflowShell>
  );
}
