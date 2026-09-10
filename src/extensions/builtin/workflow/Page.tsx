import { useEffect, useState } from "react";
import { useAppStore } from "../../../stores/appStore";
import { useWorkflowStore } from "./store/workflowStore";
import WorkflowEditorView from "./components/WorkflowEditorView";
import { getWorkflowPreferences } from "./preferences";
import { WorkflowShell } from "./components/WorkflowShell";
import { useWorkflowUiStore } from "./store/workflowUiStore";
import { TemplateLibrary } from "./components/library/TemplateLibrary";
import { WorkflowRunDialog } from "./components/runner/WorkflowRunDialog";
import type { WorkflowTemplate } from "./templates/templateService";
import { RunCenter } from "./components/runs/RunCenter";

type ModalMode = { kind: "create" } | null;

export default function WorkflowPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const current = useWorkflowStore((s) => s.currentTemplate);
  const loadList = useWorkflowStore((s) => s.loadList);
  const load = useWorkflowStore((s) => s.loadTemplate);
  const create = useWorkflowStore((s) => s.create);

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
    if (view === "editor" && editingId && current?.id !== editingId) void load(editingId);
  }, [current?.id, editingId, load, view]);

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
        <RunCenter />
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
