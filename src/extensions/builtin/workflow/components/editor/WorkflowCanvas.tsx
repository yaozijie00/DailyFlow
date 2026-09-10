import "@xyflow/react/dist/style.css";
import { useMemo, useRef } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
} from "@xyflow/react";
import type { WorkflowEdgeV2, WorkflowNodeV2, WorkflowV2 } from "../../domain/types";
import { newEdgeId } from "../../models";

type CanvasNode = Node<{ title: string; typeName: string }>;

function NodeCard({ data }: { data: CanvasNode["data"] }) {
  return <div className="min-w-40 rounded-xl border border-border-strong bg-surface px-3 py-2.5 shadow-card"><Handle type="target" position={Position.Left} className="!size-2 !border-2 !border-surface !bg-text-faint" /><p className="text-xs font-semibold text-text-primary">{data.title}</p><p className="mt-1 text-[10px] text-text-faint">{data.typeName}</p><Handle type="source" position={Position.Right} className="!size-2 !border-2 !border-surface !bg-accent" /></div>;
}

const nodeTypes = { workflowNode: NodeCard };

function toCanvasNodes(nodes: WorkflowNodeV2[], selected: Set<string>): CanvasNode[] {
  return nodes.map((node) => ({ id: node.id, type: "workflowNode", position: node.position, selected: selected.has(node.id), data: { title: node.title, typeName: node.type } }));
}

function updatePositions(workflow: WorkflowV2, nodes: CanvasNode[]): WorkflowV2 {
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  return { ...workflow, nodes: workflow.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })) };
}

export function WorkflowCanvas({ workflow, selectedIds, onDraftChange, onCommit, onSelectionChange, onDropNode }: {
  workflow: WorkflowV2;
  selectedIds: Set<string>;
  onDraftChange: (workflow: WorkflowV2) => void;
  onCommit: (workflow: WorkflowV2, base?: WorkflowV2) => void;
  onSelectionChange: (ids: string[]) => void;
  onDropNode: (type: string, position: { x: number; y: number }) => void;
}) {
  const dragBase = useRef<WorkflowV2 | null>(null);
  const nodes = useMemo(() => toCanvasNodes(workflow.nodes, selectedIds), [selectedIds, workflow.nodes]);
  const edges: Edge[] = useMemo(() => workflow.edges.map((edge) => ({ ...edge })), [workflow.edges]);
  const onNodesChange = (changes: NodeChange<CanvasNode>[]) => {
    // React Flow 会用 dimensions/select 变化维护自己的内部测量状态。把这些变化写回
    // 领域草稿会立即重建受控节点，尺寸被清空后再次测量，最终形成隐藏节点或更新循环。
    const domainChanges = changes.filter((change) => change.type === "position" || change.type === "remove");
    if (domainChanges.length === 0) return;
    const isDragging = domainChanges.some((change) => change.type === "position" && change.dragging === true);
    const dragEnded = domainChanges.some((change) => change.type === "position" && change.dragging === false);
    if (isDragging && !dragBase.current) dragBase.current = workflow;
    const nextCanvas = applyNodeChanges(domainChanges, nodes);
    const removed = new Set(domainChanges.filter((change) => change.type === "remove").map((change) => change.id));
    let next = updatePositions(workflow, nextCanvas);
    if (removed.size > 0) next = { ...next, nodes: next.nodes.filter((node) => !removed.has(node.id)), edges: next.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)) };
    if (removed.size > 0) {
      dragBase.current = null;
      onCommit(next);
    } else if (dragEnded) {
      const base = dragBase.current ?? workflow;
      dragBase.current = null;
      onCommit(next, base);
    } else {
      onDraftChange(next);
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const domainChanges = changes.filter((change) => change.type === "remove");
    if (domainChanges.length === 0) return;
    const nextEdges = applyEdgeChanges(domainChanges, edges).map((edge): WorkflowEdgeV2 => ({ id: edge.id, source: edge.source, target: edge.target, ...(edge.sourceHandle ? { sourcePort: edge.sourceHandle } : {}), ...(edge.targetHandle ? { targetPort: edge.targetHandle } : {}) }));
    onCommit({ ...workflow, edges: nextEdges });
  };
  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const next = addEdge({ ...connection, id: newEdgeId() }, edges);
    onCommit({ ...workflow, edges: next.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, ...(edge.sourceHandle ? { sourcePort: edge.sourceHandle } : {}), ...(edge.targetHandle ? { targetPort: edge.targetHandle } : {}) })) });
  };
  return (
    <div className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top_left,var(--color-accent-soft),transparent_38%)]" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); const type = event.dataTransfer.getData("application/x-workflow-node"); if (type) onDropNode(type, { x: Math.max(40, event.nativeEvent.offsetX - 80), y: Math.max(40, event.nativeEvent.offsetY - 20) }); }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={({ nodes: selected }) => onSelectionChange(selected.map((node) => node.id))} fitView proOptions={{ hideAttribution: true }} minZoom={0.35}>
        <Background gap={20} size={1} color="var(--color-border-strong)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
