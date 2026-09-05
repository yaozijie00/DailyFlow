/**
 * Workflow Extension 数据模型（纯类型 + 领域常量；无 UI/无存储依赖）。
 *
 * 关系：
 *   Task      = 我要做什么（Core）
 *   Workflow  = 我应该怎么做（本 Extension）
 *   WorkflowRun = 这一次实际怎么做（本 Extension）
 */

export const WORKFLOW_NODE_TYPES = [
  "goal",
  "app",
  "file",
  "folder",
  "action",
  "checkpoint",
  "finish",
] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_RUN_STATES = [
  "pending",
  "running",
  "paused",
  "awaiting-confirm",
  "completed",
  "failed",
  "cancelled",
] as const;
export type WorkflowRunState = (typeof WORKFLOW_RUN_STATES)[number];

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  description?: string;
  position: { x: number; y: number };
  /** 节点配置（JSON 序列化存储）：app→executablePath 等 */
  config: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

/** 时间戳统一用 Unix 毫秒（与 DailyFlow 全站一致）。 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  taskId: number | null;
  state: WorkflowRunState;
  currentNodeId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: { nodeId?: string; message: string } | null;
  createdAt: number;
}

/* ---------- id 生成（本地、无外部依赖） ---------- */

function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function newWorkflowId(): string {
  return newId("wf");
}
export function newNodeId(): string {
  return newId("wfnode");
}
export function newEdgeId(): string {
  return newId("wfedge");
}
export function newRunId(): string {
  return newId("wfrun");
}
