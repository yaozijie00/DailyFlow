import { useMemo, useState } from "react";
import { AlignHorizontalSpaceAround, ArrowLeft, Play, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import type { WorkflowNodeRegistry } from "../../domain/nodeRegistry";
import { validateAndOrderWorkflowGraph } from "../../domain/planner";
import type { ValidationIssue, WorkflowNodeV2, WorkflowV2, WorkflowVariableValues } from "../../domain/types";
import { resolveConfigTemplates } from "../../domain/variables";
import { newNodeId } from "../../models";
import {
  commitEditorHistory,
  createEditorHistory,
  isEditorHistoryDirty,
  markEditorHistoryClean,
  redoEditorHistory,
  replaceEditorPresent,
  undoEditorHistory,
} from "./editorHistory";
import { NodeInspector } from "./NodeInspector";
import { NodePalette } from "./NodePalette";
import { ValidationPanel } from "./ValidationPanel";
import { WorkflowCanvas } from "./WorkflowCanvas";

function sampleVariables(workflow: WorkflowV2): WorkflowVariableValues {
  return Object.fromEntries(workflow.variables.map((definition) => {
    if (definition.defaultValue !== undefined) return [definition.key, definition.defaultValue];
    if (definition.type === "number") return [definition.key, 1];
    if (definition.type === "boolean") return [definition.key, false];
    if (definition.type === "date") return [definition.key, "2026-01-01"];
    if (definition.type === "file") return [definition.key, "C:\\Preview\\file.txt"];
    if (definition.type === "folder") return [definition.key, "C:\\Preview"];
    if (definition.type === "select") return [definition.key, definition.options?.[0]?.value ?? "sample"];
    return [definition.key, "sample"];
  }));
}

function validateEditorWorkflow(workflow: WorkflowV2, registry: WorkflowNodeRegistry): ValidationIssue[] {
  const variables = sampleVariables(workflow);
  const issues = [...validateAndOrderWorkflowGraph(workflow).issues];
  for (const node of workflow.nodes) {
    const definition = registry.get(node.type);
    if (!definition) {
      issues.push({ code: "node.unregistered", message: `未注册节点：${node.type}`, severity: "error", nodeId: node.id });
      continue;
    }
    const resolved = resolveConfigTemplates(node.config, variables, workflow.variables);
    if (!resolved.ok) {
      issues.push(...resolved.issues.map((issue) => ({ ...issue, nodeId: node.id })));
      continue;
    }
    issues.push(...definition.validate(resolved.value, { workflow, node, variables, resolvedConfig: resolved.value }));
  }
  return issues;
}

export function WorkflowEditor({ workflow, registry, onSave, onBack, onPreview }: {
  workflow: WorkflowV2;
  registry: WorkflowNodeRegistry;
  onSave: (workflow: WorkflowV2) => Promise<void>;
  onBack: () => void;
  onPreview: (workflow: WorkflowV2) => Promise<void> | void;
}) {
  const [history, setHistory] = useState(() => createEditorHistory(workflow));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>(() => validateEditorWorkflow(workflow, registry));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draft = history.present;
  const selected = draft.nodes.find((node) => node.id === selectedIds[0]) ?? null;
  const definitions = useMemo(() => registry.list(), [registry]);

  const commit = (next: WorkflowV2, base?: WorkflowV2) => {
    setHistory((current) => commitEditorHistory(base ? replaceEditorPresent(current, base) : current, next));
    setIssues(validateEditorWorkflow(next, registry));
    setSaveError(null);
  };
  const replace = (next: WorkflowV2) => setHistory((current) => replaceEditorPresent(current, next));

  const addNode = (type: string, position = { x: 160 + draft.nodes.length * 28, y: 160 }) => {
    const definition = registry.require(type);
    const config = Object.fromEntries(definition.configSchema.fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue]));
    const node: WorkflowNodeV2 = { id: newNodeId(), type, typeVersion: definition.version, title: definition.title, description: definition.description, position, config };
    commit({ ...draft, nodes: [...draft.nodes, node] });
    setSelectedIds([node.id]);
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const ids = new Set(selectedIds);
    commit({ ...draft, nodes: draft.nodes.filter((node) => !ids.has(node.id)), edges: draft.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)) });
    setSelectedIds([]);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...structuredClone(selected), id: newNodeId(), title: `${selected.title} 副本`, position: { x: selected.position.x + 32, y: selected.position.y + 48 } };
    commit({ ...draft, nodes: [...draft.nodes, copy] });
    setSelectedIds([copy.id]);
  };

  const autoArrange = () => {
    const graph = validateAndOrderWorkflowGraph(draft);
    const orderedIds = new Set(graph.order.map((node) => node.id));
    const ordered = [...graph.order, ...draft.nodes.filter((node) => !orderedIds.has(node.id))];
    commit({ ...draft, nodes: ordered.map((node, index) => ({ ...node, position: { x: 80 + (index % 4) * 230, y: 100 + Math.floor(index / 4) * 150 } })) });
  };

  const save = async () => {
    const nextIssues = validateEditorWorkflow(draft, registry);
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.severity === "error")) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = { ...draft, version: draft.version + 1, updatedAt: Date.now() };
      await onSave(next);
      setHistory((current) => markEditorHistoryClean(replaceEditorPresent(current, next)));
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (!isEditorHistoryDirty(history) || window.confirm("有未保存的修改，确定离开编辑器吗？")) onBack();
  };

  return (
    <div className="flex h-full min-h-[34rem] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-3">
        <button type="button" onClick={leave} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm text-text-secondary hover:bg-surface-hover"><ArrowLeft size={15} />返回</button>
        <div className="mx-1 h-5 w-px bg-border-subtle" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text-primary">{draft.name}</p><p className="text-[10px] text-text-faint">v{draft.version}{isEditorHistoryDirty(history) ? " · 未保存" : " · 已保存"}</p></div>
        <button type="button" aria-label="撤销" disabled={history.past.length === 0} onClick={() => setHistory(undoEditorHistory)} className="grid size-10 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30"><Undo2 size={15} /></button>
        <button type="button" aria-label="重做" disabled={history.future.length === 0} onClick={() => setHistory(redoEditorHistory)} className="grid size-10 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover disabled:opacity-30"><Redo2 size={15} /></button>
        <button type="button" onClick={autoArrange} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs text-text-secondary hover:bg-surface-hover"><AlignHorizontalSpaceAround size={14} />自动排列</button>
        <button type="button" onClick={() => void onPreview(draft)} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border-strong px-3 text-xs text-text-secondary hover:bg-surface-hover"><Play size={14} />试运行</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"><Save size={14} />{saving ? "保存中…" : "保存"}</button>
      </header>
      {saveError && <div role="alert" className="flex items-center gap-2 border-b border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger">{saveError}<span className="ml-auto">草稿仍保留在编辑器中</span></div>}
      <div className="flex min-h-0 flex-1">
        <NodePalette definitions={definitions} onAdd={addNode} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          {selectedIds.length > 1 && <button type="button" onClick={deleteSelected} className="absolute right-3 top-3 z-10 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-danger/20 bg-bg-elevated px-3 text-xs text-danger shadow-popover"><Trash2 size={13} />删除 {selectedIds.length} 个节点</button>}
          <WorkflowCanvas workflow={draft} selectedIds={new Set(selectedIds)} onDraftChange={replace} onCommit={commit} onSelectionChange={setSelectedIds} onDropNode={addNode} />
          <ValidationPanel issues={issues} onSelectNode={(nodeId) => setSelectedIds([nodeId])} />
        </div>
        <NodeInspector node={selected} definition={selected ? registry.get(selected.type) : undefined} onChange={(node) => commit({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? node : item) })} onDuplicate={duplicateSelected} onDelete={deleteSelected} />
      </div>
    </div>
  );
}
