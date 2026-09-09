import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Copy, Pencil, Trash2, Play, ListChecks, Settings2, Link2 } from "lucide-react";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useAppStore } from "../../../stores/appStore";
import { useWorkflowStore } from "./store/workflowStore";
import WorkflowEditorView from "./components/WorkflowEditorView";
import { workflowRunnerHost } from "./runnerHost";
import { getHostContext } from "../../registry";
import { todayString } from "../../../lib/date";
import { getWorkflowPreferences } from "./preferences";

type ModalMode = { kind: "create" } | { kind: "edit"; id: string } | null;

interface TaskOption {
  id: number;
  title: string;
}

/** 「按任务运行」选择器状态：pick = null 关闭；否则展示某日任务供选择。 */
interface TaskPickerState {
  wfId: string;
  wfName: string;
  tasks: TaskOption[];
  loading: boolean;
  error: string | null;
}

interface RunnerPanel {
  runId: string;
  wfName: string;
  state: string;
  busy: boolean;
  hint?: string;
}

export default function WorkflowPage() {
  const pushToast = useAppStore((s) => s.pushToast);
  const list = useWorkflowStore((s) => s.list);
  const current = useWorkflowStore((s) => s.current);
  const loadList = useWorkflowStore((s) => s.loadList);
  const load = useWorkflowStore((s) => s.load);
  const create = useWorkflowStore((s) => s.create);
  const updateMeta = useWorkflowStore((s) => s.updateMeta);
  const remove = useWorkflowStore((s) => s.remove);
  const duplicate = useWorkflowStore((s) => s.duplicate);

  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panel, setPanel] = useState<RunnerPanel | null>(null);
  const [picker, setPicker] = useState<TaskPickerState | null>(null);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 注意：所有 hook 必须在条件 return（编辑器视图早退）之前调用，
  // 否则切视图时 hook 数量变化会触发 React "Rendered fewer hooks than expected"。
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q) ||
        w.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [list, query]);

  const openEditor = (id: string) => {
    setEditingId(id);
    setView("editor");
    void load(id);
  };

  /** Phase 6：打开「按今日任务运行」选择器（经 CoreContext 只读查任务，不碰 Task 库）。 */
  const openTaskPicker = async (wfId: string, wfName: string) => {
    const ctx = getHostContext();
    if (!ctx?.tasks?.listByDate) {
      pushToast("error", "任务联动不可用（宿主未提供 listByDate）");
      return;
    }
    setPicker({ wfId, wfName, tasks: [], loading: true, error: null });
    try {
      const rows = await ctx.tasks.listByDate(todayString());
      // 只提供未完成任务供关联（已完成/取消的不再需要 Workflow 执行）
      const tasks: TaskOption[] = rows
        .filter((r) => r.status === "TODO")
        .map((r) => ({ id: r.id, title: r.title }));
      setPicker({ wfId, wfName, tasks, loading: false, error: null });
    } catch (e) {
      setPicker({
        wfId,
        wfName,
        tasks: [],
        loading: false,
        error: e instanceof Error ? e.message : "加载任务失败",
      });
    }
  };

  // 画布视图（编辑器）
  if (view === "editor") {
    if (!current || current.id !== editingId) {
      // 加载失败/记录不存在时给出逃生出口（Phase 3：避免永久「加载中」卡死）
      return (
        <div className="mx-auto w-full max-w-4xl">
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
                  setView("list");
                  setEditingId(null);
                  void loadList();
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:bg-accent-hover"
              >
                返回列表
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ height: "calc(100vh - 150px)" }} className="w-full">
        <WorkflowEditorView
          workflow={current}
          onBack={() => {
            setView("list");
            setEditingId(null);
            void loadList();
          }}
          onSaved={() => {
            void loadList();
            if (editingId) void load(editingId);
            pushToast("success", "Workflow 已保存");
          }}
        />
      </div>
    );
  }

  const openCreate = () => {
    setName("");
    setDesc("");
    setTagsText("");
    setModal({ kind: "create" });
  };

  const openEdit = (id: string, w: { name: string; description?: string; tags: string[] }) => {
    setName(w.name);
    setDesc(w.description ?? "");
    setTagsText(w.tags.join(", "));
    setModal({ kind: "edit", id });
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
    if (modal?.kind === "edit") {
      await updateMeta(modal.id, { name: t, description: desc.trim() || undefined, tags });
    }
    setModal(null);
  };

  const applyRunResult = (r: {
    run: { state: string; id: string; error?: { nodeId?: string; message: string } | null };
    wfName: string;
  }) => {
    if (r.run.state === "paused") {
      setPanel({ runId: r.run.id, wfName: r.wfName, state: "paused", busy: false, hint: "到达检查点：确认完成后继续执行" });
    } else if (r.run.state === "awaiting-confirm") {
      setPanel({ runId: r.run.id, wfName: r.wfName, state: "awaiting-confirm", busy: false, hint: "流程已到终点：确认后将完成任务并结束运行" });
    } else if (r.run.state === "completed") {
      setPanel(null);
      pushToast("success", `Workflow「${r.wfName}」已完成`);
    } else if (r.run.state === "failed") {
      // Phase 3：失败原因对用户可见（校验错误/失败节点/配置缺失等）
      const reason = r.run.error?.message;
      setPanel(null);
      pushToast("error", reason ? `Workflow 执行失败：${reason}` : `Workflow「${r.wfName}」执行失败`);
    } else {
      setPanel({ runId: r.run.id, wfName: r.wfName, state: r.run.state, busy: false });
    }
  };

  const startRun = async (wfId: string, wfName: string, taskId?: number | null) => {
    setPanel({ runId: "", wfName, state: "starting", busy: true });
    try {
      const res = await workflowRunnerHost.start(wfId, taskId ?? null);
      applyRunResult({ run: res.run, wfName });
    } catch (e) {
      setPanel(null);
      pushToast("error", e instanceof Error ? e.message : "启动失败");
    }
  };

  const resumeRun = async () => {
    if (!panel) return;
    setPanel({ ...panel, busy: true });
    try {
      const res = await workflowRunnerHost.resume(panel.runId);
      applyRunResult({ run: res.run, wfName: panel.wfName });
    } catch (e) {
      setPanel({ ...panel, busy: false });
      pushToast("error", e instanceof Error ? e.message : "恢复失败");
    }
  };

  const confirmFinishRun = async () => {
    if (!panel) return;
    setPanel({ ...panel, busy: true });
    try {
      const res = await workflowRunnerHost.confirmFinish(panel.runId);
      applyRunResult({ run: res.run, wfName: panel.wfName });
    } catch (e) {
      setPanel({ ...panel, busy: false });
      pushToast("error", e instanceof Error ? e.message : "确认完成失败");
    }
  };

  const cancelRun = async () => {
    if (!panel || !panel.runId) return;
    setPanel({ ...panel, busy: true });
    try {
      await workflowRunnerHost.cancel(panel.runId);
      setPanel(null);
      pushToast("info", "WorkflowRun 已取消");
    } catch {
      setPanel({ ...panel, busy: false });
      pushToast("error", "取消失败");
    }
  };

  const inputCls =
    "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-faint focus:border-accent";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Workflow"
        description="Workflow = 应该怎么做；WorkflowRun = 这一次实际怎么做。"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm text-on-accent hover:bg-accent-hover"
          >
            <Plus size={16} /> 新建
          </button>
        }
      />

      {panel && (
        <div className="rounded-md border border-border-subtle glass-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {panel.state === "starting"
                  ? "正在启动…"
                  : panel.state === "paused"
                    ? "检查点暂停"
                    : panel.state === "awaiting-confirm"
                      ? "到达终点"
                      : `状态：${panel.state}`}
              </div>
              <div className="truncate text-xs text-text-muted">
                {panel.wfName}
                {panel.hint ? ` · ${panel.hint}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {panel.state === "paused" && (
                <button
                  onClick={() => void resumeRun()}
                  disabled={panel.busy}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:bg-accent-hover disabled:opacity-40"
                >
                  {panel.busy ? "执行中…" : "确认完成，继续"}
                </button>
              )}
              {panel.state === "awaiting-confirm" && (
                <button
                  onClick={() => void confirmFinishRun()}
                  disabled={panel.busy}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:bg-accent-hover disabled:opacity-40"
                >
                  {panel.busy ? "执行中…" : "确认完成任务"}
                </button>
              )}
              {(panel.state === "paused" || panel.state === "awaiting-confirm") && (
                <button
                  onClick={() => void cancelRun()}
                  disabled={panel.busy}
                  className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                >
                  取消运行
                </button>
              )}
              {panel.state === "starting" && (
                <button onClick={() => setPanel(null)} className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover">
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={28} />}
          title="还没有 Workflow"
          description="新建一个 Workflow，把一件事的完成方法固定下来：在画布上添加节点并连线，保存后即可运行。"
          action={
            <button
              onClick={openCreate}
              className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent hover:bg-accent-hover"
            >
              新建 Workflow
            </button>
          }
        />
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述 / 标签…"
              className="w-full rounded-md border border-border-strong bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none placeholder:text-text-faint focus:border-accent"
            />
          </div>

          <div className="space-y-2">
            {filtered.map((w) => (
              <div key={w.id} className="rounded-md border border-border-subtle glass-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">{w.name}</span>
                      {w.tags.length > 0 && (
                        <span className="flex gap-1">
                          {w.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-surface-muted px-1.5 py-px text-[10px] text-text-muted"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {w.description && (
                      <p className="mt-0.5 truncate text-xs text-text-muted">{w.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => void startRun(w.id, w.name)}
                      disabled={panel?.busy}
                      title="运行（检查点会暂停确认）"
                      className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                    >
                      <Play size={12} /> 运行
                    </button>
                    <button
                      onClick={() => void openTaskPicker(w.id, w.name)}
                      disabled={panel?.busy}
                      aria-label={`按任务运行 ${w.name}`}
                      title="运行并关联今日任务（到达终点确认后完成任务）"
                      className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                    >
                      <Link2 size={12} /> 按任务运行
                    </button>
                    <button
                      onClick={() => openEditor(w.id)}
                      aria-label={`编辑 ${w.name}`}
                      title="打开画布编辑器"
                      className="rounded p-1.5 text-text-faint hover:bg-surface-hover hover:text-text-secondary"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => void duplicate(w.id)}
                      aria-label={`复制 ${w.name}`}
                      title="复制"
                      className="rounded p-1.5 text-text-faint hover:bg-surface-hover hover:text-text-secondary"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(w.id, w)}
                      aria-label={`属性 ${w.name}`}
                      title="编辑名称/描述/标签"
                      className="rounded p-1.5 text-text-faint hover:bg-surface-hover hover:text-text-secondary"
                    >
                      <Settings2 size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`删除 Workflow「${w.name}」？其运行记录将一并删除。`)) {
                          void remove(w.id);
                        }
                      }}
                      aria-label={`删除 ${w.name}`}
                      title="删除"
                      className="rounded p-1.5 text-text-faint hover:bg-surface-hover hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-text-faint">
                没有匹配的 Workflow
              </p>
            )}
          </div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="glass-surface mx-auto mt-[6vh] w-full max-w-md rounded-lg border border-border-subtle p-6 shadow-popover">
            <h2 className="mb-4 text-lg font-semibold">
              {modal.kind === "create" ? "新建 Workflow" : "编辑属性"}
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
                  {modal.kind === "create" ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 6：按任务运行选择器（关联今日待办任务；经 ctx 只读，完成经 ctx.tasks.complete） */}
      {picker && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="glass-surface mx-auto mt-[8vh] w-full max-w-md rounded-lg border border-border-subtle p-6 shadow-popover">
            <h2 className="mb-1 text-lg font-semibold">按任务运行</h2>
            <p className="mb-4 text-xs text-text-muted">
              Workflow「{picker.wfName}」将关联所选任务：到达终点后需你确认，才把该任务标记完成。
            </p>
            {picker.loading ? (
              <p className="py-4 text-center text-sm text-text-faint">加载今日任务…</p>
            ) : picker.error ? (
              <p className="rounded-md border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
                加载失败：{picker.error}
              </p>
            ) : picker.tasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-text-faint">
                今天没有待办任务。先在「今日」创建任务，再回来按任务运行。
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {picker.tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        const { wfId, wfName } = picker;
                        setPicker(null);
                        void startRun(wfId, wfName, t.id);
                      }}
                      disabled={panel?.busy}
                      className="flex w-full items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover disabled:opacity-40"
                    >
                      <Link2 size={13} className="shrink-0 text-text-faint" />
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <Play size={12} className="shrink-0 text-text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setPicker(null)}
                className="rounded-md border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
