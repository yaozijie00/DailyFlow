import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
} from "@xyflow/react";
import { ArrowLeft, Save, RotateCcw, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  WORKFLOW_NODE_TYPES,
  newNodeId,
  newEdgeId,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
} from "../models";
import { workflowService } from "../services/workflowService";
import { validateWorkflow } from "../engine/workflowEngine";
import { useAppStore } from "../../../../stores/appStore";

type WFNodeData = {
  label: string;
  description?: string;
  wfType: WorkflowNodeType;
  config: Record<string, unknown>;
};
type WFNode = Node<WFNodeData>;

const TYPE_LABELS: Record<WorkflowNodeType, string> = {
  goal: "目标（起点）",
  app: "打开应用",
  file: "打开文件",
  folder: "打开文件夹",
  action: "动作",
  checkpoint: "检查点（暂停确认）",
  finish: "完成（终点）",
};

const NODE_STYLE: Record<WorkflowNodeType, string> = {
  goal: "border-emerald-300 bg-emerald-50 text-emerald-800",
  app: "border-blue-300 bg-blue-50 text-blue-800",
  file: "border-violet-300 bg-violet-50 text-violet-800",
  folder: "border-amber-300 bg-amber-50 text-amber-800",
  action: "border-border-strong bg-surface-muted text-text-secondary",
  checkpoint: "border-orange-300 bg-orange-50 text-orange-800",
  finish: "border-rose-300 bg-rose-50 text-rose-800",
};

function WorkflowNodeCard({ data }: { data: WFNodeData }) {
  const { wfType, label, description } = data;
  return (
    <div
      className={`w-44 rounded-md border px-3 py-2 text-xs shadow-card ${NODE_STYLE[wfType]}`}
    >
      <div className="font-medium">{label || TYPE_LABELS[wfType]}</div>
      <div className="mt-0.5 text-[10px] opacity-70">{TYPE_LABELS[wfType]}</div>
      {description && (
        <div className="mt-1 line-clamp-2 break-words text-[10px] opacity-60">{description}</div>
      )}
      {wfType !== "goal" && (
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-text-faint" />
      )}
      {wfType !== "finish" && (
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-text-faint" />
      )}
    </div>
  );
}

const nodeTypes = { wfNode: WorkflowNodeCard };

function toXy(wf: Workflow): { nodes: WFNode[]; edges: Edge[] } {
  const nodes: WFNode[] = wf.nodes.map((n) => ({
    id: n.id,
    type: "wfNode",
    position: { x: n.position.x, y: n.position.y },
    data: { label: n.title, description: n.description, wfType: n.type, config: n.config },
  }));
  const edges: Edge[] = wf.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return { nodes, edges };
}

function toModelNodes(nodes: WFNode[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.data.wfType,
    title: n.data.label.trim() || TYPE_LABELS[n.data.wfType],
    description: n.data.description?.trim() || undefined,
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    config: n.data.config,
  }));
}

export default function WorkflowEditorView({
  workflow,
  onBack,
  onSaved,
}: {
  workflow: Workflow;
  onBack: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(() => toXy(workflow), [workflow]);
  const [nodes, setNodes] = useState<WFNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  /**
   * 节点变更（含键盘 Delete/Backspace 删除）：
   * 应用变更之外，若本次含「删除节点」，级联清理其相连边 ——
   * 避免悬挂边被保存入库（Phase 3 修复；xyflow 删除节点不自动清边）。
   */
  const onNodesChange = useCallback((changes: NodeChange<WFNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    const removed = changes
      .filter((c) => c.type === "remove")
      .map((c) => (c as { id: string }).id);
    if (removed.length > 0) {
      setEdges((eds) => eds.filter((e) => !removed.includes(e.source) && !removed.includes(e.target)));
      setSelectedNodeId((sel) => (sel && removed.includes(sel) ? null : sel));
    }
  }, []);
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      setEdges((eds) => addEdge({ ...conn, id: newEdgeId() }, eds));
    },
    [],
  );

  const addNode = (type: WorkflowNodeType) => {
    const id = newNodeId();
    const n: WFNode = {
      id,
      type: "wfNode",
      position: { x: 120 + (nodes.length % 5) * 40, y: 80 + (nodes.length % 6) * 60 },
      data: { label: "", wfType: type, config: {} },
    };
    setNodes((ns) => [...ns, n]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setDraftLabel("");
    setDraftDescription("");
    setError(null);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
    setEdges((es) => es.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setError(null);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    setEdges((es) => es.filter((e) => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    setError(null);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const commitLabel = () => {
    if (!selectedNodeId) return;
    setNodes((ns) =>
      ns.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, label: draftLabel } } : n)),
    );
    setError(null);
  };

  const commitDescription = () => {
    if (!selectedNodeId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, description: draftDescription.trim() || undefined } }
          : n,
      ),
    );
    setError(null);
  };

  const updateConfig = (patch: Record<string, unknown>) => {
    if (!selectedNodeId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } }
          : n,
      ),
    );
    setError(null);
  };

  /**
   * 保存前结构校验（Phase 3）：V1 线性链限制（1 goal + 1 finish、每节点 ≤1 出/入边、
   * 无环、无悬空边）未满足时阻止入库，错误就地展示 —— 不把非法图写进数据库。
   */
  const save = async () => {
    setSaving(true);
    try {
      const modelNodes = toModelNodes(nodes);
      const modelEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));
      const wfForCheck: Workflow = { ...workflow, nodes: modelNodes, edges: modelEdges };
      const errs = validateWorkflow(wfForCheck);
      if (errs.length > 0) {
        setError(`Workflow 无法保存：\n${errs.join("\n")}`);
        return; // 非法图不入库
      }
      await workflowService.saveGraph(workflow.id, modelNodes, modelEdges);
      setError(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试");
      useAppStore.getState().pushToast("error", "Workflow 保存失败，改动未写入");
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    const r = toXy(workflow);
    setNodes(r.nodes);
    setEdges(r.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setError(null);
  };

  const config = (selectedNode?.data.config ?? {}) as Record<string, string>;
  const inputCls =
    "w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-faint focus:border-accent";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-hover">
          <ArrowLeft size={15} /> 返回
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{workflow.name}</span>
        <button onClick={reload} title="重新加载（放弃未保存改动）" className="flex items-center gap-1 rounded-md border border-border-strong px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-hover">
          <RotateCcw size={13} /> 重新加载
        </button>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:bg-accent-hover disabled:opacity-40"
        >
          <Save size={13} /> {saving ? "保存中…" : "保存"}
        </button>
      </div>

      {/* 保存校验/失败提示（Phase 3：非法图不入库且原因可见） */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50/80 px-3 py-2 text-xs leading-relaxed text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2">
        {/* 节点面板 */}
        <aside className="w-44 shrink-0 space-y-1 overflow-y-auto rounded-md border border-border-subtle glass-surface p-2">
          <div className="mb-1 text-xs font-medium text-text-muted">节点</div>
          {WORKFLOW_NODE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="flex w-full items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover"
            >
              <Plus size={12} className="shrink-0 text-text-faint" />
              <span className="truncate">{TYPE_LABELS[t]}</span>
            </button>
          ))}
          <p className="mt-2 text-[10px] leading-relaxed text-text-faint">
            从左侧添加节点，拖动节点连线；选中节点/连线后在右侧编辑或删除。
          </p>
        </aside>

        {/* 画布 */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-border-subtle glass-surface">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => {
              setSelectedNodeId(n.id);
              setSelectedEdgeId(null);
              setDraftLabel((n.data as WFNodeData).label);
              setDraftDescription((n.data as WFNodeData).description ?? "");
              setError(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdgeId(e.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="#e5e5e5" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <aside className="w-64 shrink-0 space-y-3 overflow-y-auto rounded-md border border-border-subtle glass-surface p-3">
          {selectedEdgeId ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">连线</span>
                <button onClick={deleteSelectedEdge} title="删除连线" className="rounded p-1 text-text-faint hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-xs text-text-muted">点击节点可查看/编辑节点。</p>
            </>
          ) : selectedNode ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {TYPE_LABELS[selectedNode.data.wfType]}
                </span>
                <button onClick={deleteSelectedNode} title="删除节点" className="rounded p-1 text-text-faint hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-text-muted">标题</label>
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onBlur={commitLabel}
                  className={inputCls}
                  placeholder={TYPE_LABELS[selectedNode.data.wfType]}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-text-muted">说明（可选）</label>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  onBlur={commitDescription}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder={
                    selectedNode.data.wfType === "checkpoint"
                      ? "运行暂停时显示的确认提示语"
                      : "补充说明（显示在节点卡片上）"
                  }
                />
              </div>
              {selectedNode.data.wfType === "app" && (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] text-text-muted">程序路径</label>
                    <input
                      value={config.executablePath ?? ""}
                      onChange={(e) => updateConfig({ executablePath: e.target.value })}
                      className={inputCls}
                      placeholder="D:\\Tools\\Blender\\blender.exe"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-text-muted">参数（可选）</label>
                    <input value={config.arguments ?? ""} onChange={(e) => updateConfig({ arguments: e.target.value })} className={inputCls} placeholder="--background" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-text-muted">工作目录（可选）</label>
                    <input value={config.workingDirectory ?? ""} onChange={(e) => updateConfig({ workingDirectory: e.target.value })} className={inputCls} placeholder="D:\\Project\\Stone" />
                  </div>
                </>
              )}
              {(selectedNode.data.wfType === "file" || selectedNode.data.wfType === "folder") && (
                <div>
                  <label className="mb-1 block text-[11px] text-text-muted">
                    {selectedNode.data.wfType === "file" ? "文件路径" : "文件夹路径"}
                  </label>
                  <input value={config.path ?? ""} onChange={(e) => updateConfig({ path: e.target.value })} className={inputCls} placeholder="D:\\Project\\Stone\\Stone.sbs" />
                </div>
              )}
              {selectedNode.data.wfType === "checkpoint" && (
                <p className="text-[11px] leading-relaxed text-text-faint">
                  运行到此节点会暂停，等待你确认（标题即提示语）。
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-text-faint">点击画布上的节点进行编辑。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
