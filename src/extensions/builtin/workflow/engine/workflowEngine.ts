import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowNodeType } from "../models";

/**
 * Workflow Engine（纯 TS，不依赖 React/DB/系统调用）。
 * V1 规则：
 *  - 顺序执行：恰好一个 goal 起点、一个可达 finish 终点；
 *  - 不允许分支/循环：每节点 ≤1 出边、≤1 入边（Engine 会校验）；
 *  - Checkpoint → 暂停；用户确认后 resume 继续；Finish → completed；异常 → failed。
 */

export interface WorkflowExecutorContext {
  node: WorkflowNode;
  workflow: Workflow;
  trace: string[];
}

export interface NodeExecutionResult {
  status: "continue" | "checkpoint" | "failed";
  message?: string;
}

export interface WorkflowNodeExecutor {
  execute(ctx: WorkflowExecutorContext): Promise<NodeExecutionResult>;
}

export type WorkflowRunEngineOutcome =
  | { state: "completed"; trace: string[] }
  | { state: "paused"; nodeId: string; trace: string[] }
  | { state: "failed"; nodeId?: string; message: string; trace: string[] };

/** 单点后继（顺序执行：只允许 0/1 个）。 */
export function nextOf(nodeId: string, edges: WorkflowEdge[]): string | null {
  const outs = edges.filter((e) => e.source === nodeId);
  if (outs.length === 0) return null;
  return outs[0].target;
}

/** 入边数（用于校验线性链）。 */
export function incomingOf(nodeId: string, edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((e) => e.target === nodeId);
}

/** 校验图结构：返回错误列表（空 = 可执行）。 */
export function validateWorkflow(wf: Workflow): string[] {
  const errors: string[] = [];
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const goals = wf.nodes.filter((n) => n.type === "goal");
  if (goals.length === 0) errors.push("缺少 goal 起点节点");
  if (goals.length > 1) errors.push("不允许存在多个 goal 起点（V1 顺序执行）");
  const finish = wf.nodes.filter((n) => n.type === "finish");
  if (finish.length === 0) errors.push("缺少 finish 终点节点");
  if (finish.length > 1) errors.push("不允许存在多个 finish 终点");

  for (const n of wf.nodes) {
    const outs = wf.edges.filter((e) => e.source === n.id);
    if (outs.length > 1) errors.push(`节点「${n.title}」有 ${outs.length} 条出边（V1 仅支持顺序执行）`);
    const ins = incomingOf(n.id, wf.edges);
    if (n.type !== "goal" && ins.length > 1) {
      errors.push(`节点「${n.title}」有多条入边（V1 仅支持线性链）`);
    }
  }
  for (const e of wf.edges) {
    if (!byId.has(e.source)) errors.push(`连线指向不存在的节点：${e.source}`);
    if (!byId.has(e.target)) errors.push(`连线指向不存在的节点：${e.target}`);
  }
  // 环检测（简单防循环：路径上节点不可重复）
  const start = goals[0];
  if (start) {
    const seen = new Set<string>();
    let cur: WorkflowNode | null = start;
    while (cur) {
      if (seen.has(cur.id)) {
        errors.push("检测到循环（V1 不允许）");
        break;
      }
      seen.add(cur.id);
      cur = nextOf(cur.id, wf.edges) ? (byId.get(nextOf(cur.id, wf.edges)!) ?? null) : null;
    }
  }
  return errors;
}

/** 线性遍历：从 goal（或 resume 起始节点之后）按边推进。 */
function orderedPath(
  wf: Workflow,
  startNodeId: string | null,
): WorkflowNode[] | null {
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const errors = validateWorkflow(wf);
  if (errors.length > 0) return null;
  const start =
    startNodeId != null
      ? byId.get(startNodeId) ?? null
      : (wf.nodes.find((n) => n.type === "goal") ?? null);
  if (!start) return null;
  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  let cur: WorkflowNode | null = start;
  while (cur) {
    if (seen.has(cur.id)) return null; // 防环兜底
    seen.add(cur.id);
    order.push(cur);
    const nx = nextOf(cur.id, wf.edges);
    cur = nx ? (byId.get(nx) ?? null) : null;
  }
  return order;
}

/**
 * 执行直到被阻塞（checkpoint 暂停 / finish 完成 / 失败）。
 * @param resumeAfterNodeId 恢复执行：跳过该节点（用户已确认 checkpoint），从其下一节点继续。
 */
export async function runWorkflowEngine(
  wf: Workflow,
  executors: Record<string, WorkflowNodeExecutor>,
  resumeAfterNodeId: string | null = null,
  onNodeEnter?: (node: WorkflowNode) => void,
): Promise<WorkflowRunEngineOutcome> {
  const trace: string[] = [];
  const errors = validateWorkflow(wf);
  if (errors.length > 0) {
    return { state: "failed", message: errors.join("；"), trace };
  }

  // 恢复：从 checkpoint 之后继续；否则从 goal 开始
  let startId: string | null = null;
  if (resumeAfterNodeId != null) {
    // 校验：暂停的 checkpoint 必须仍存在于当前图（编辑删除后不应静默伪完成）
    if (!wf.nodes.some((n) => n.id === resumeAfterNodeId)) {
      return {
        state: "failed",
        nodeId: resumeAfterNodeId,
        message: `暂停节点已被删除或修改，无法继续执行（resume 节点：${resumeAfterNodeId}）`,
        trace,
      };
    }
    const nx = nextOf(resumeAfterNodeId, wf.edges);
    startId = nx ?? null;
    if (!startId) {
      // 暂停点之后没有后继：若其后续曾存在但被编辑移除，属结构变化 → failed，不静默 completed
      return {
        state: "failed",
        nodeId: resumeAfterNodeId,
        message: "暂停节点之后没有可执行的下一节点（Workflow 结构可能已被修改）",
        trace,
      };
    }
  }
  const order = orderedPath(wf, startId);
  if (!order) return { state: "failed", message: "无法建立执行顺序", trace };

  for (const node of order) {
    const ts = () => new Date().toISOString();
    trace.push(`${ts()} node=${node.id} type=${node.type}`);
    onNodeEnter?.(node);
    const executor = executors[node.type];
    if (!executor) {
      return {
        state: "failed",
        nodeId: node.id,
        message: `没有「${node.type}」节点的执行器（V1 范围外）`,
        trace,
      };
    }
    // 异常隔离：executor 抛错（含同步 throw）一律转 failed，防止 run 永久滞留 running
    let result: NodeExecutionResult;
    try {
      result = await executor.execute({ node, workflow: wf, trace });
    } catch (e) {
      return {
        state: "failed",
        nodeId: node.id,
        message: e instanceof Error ? e.message : String(e),
        trace,
      };
    }
    if (result.status === "failed") {
      return {
        state: "failed",
        nodeId: node.id,
        message: result.message ?? "节点执行失败",
        trace,
      };
    }
    if (result.status === "checkpoint") {
      // 暂停：等待用户确认后 resume（跳过本 checkpoint 继续）
      return { state: "paused", nodeId: node.id, trace };
    }
    if (node.type === "finish") {
      return { state: "completed", trace };
    }
  }
  // 顺序跑完但没遇到 finish → 视为未完成结构（validator 已保证 finish 存在可达）
  const hasFinish = order.some((n) => n.type === "finish");
  if (!hasFinish) {
    return { state: "failed", message: "执行链未包含 finish 终点", trace };
  }
  return { state: "completed", trace };
}

/**
 * V1 内置执行器：
 * - goal/finish/action：无系统副作用（action = 人工操作提示步骤，如「在软件里导出贴图」，
 *   不暂停、不做系统调用，仅推进；说明写在其标题/description）；
 * - checkpoint：暂停等用户确认；
 * - app/file/folder：需系统实现（P7 注入 Tauri invoke），未接入时报错说明。
 */
export function createDefaultExecutors(system: {
  launchApp?: (node: WorkflowNode) => Promise<void>;
  openFile?: (node: WorkflowNode) => Promise<void>;
  openFolder?: (node: WorkflowNode) => Promise<void>;
} = {}): Record<WorkflowNodeType, WorkflowNodeExecutor> {
  return {
    goal: { execute: async () => ({ status: "continue" as const }) },
    action: { execute: async () => ({ status: "continue" as const }) },
    app: {
      execute: async (ctx) => {
        if (!system.launchApp) {
          return { status: "failed", message: "App 节点：系统操作尚未接入（P7）" };
        }
        try {
          await system.launchApp(ctx.node);
          return { status: "continue" };
        } catch (e) {
          return { status: "failed", message: e instanceof Error ? e.message : String(e) };
        }
      },
    },
    file: {
      execute: async (ctx) => {
        if (!system.openFile) {
          return { status: "failed", message: "File 节点：系统操作尚未接入（P7）" };
        }
        try {
          await system.openFile(ctx.node);
          return { status: "continue" };
        } catch (e) {
          return { status: "failed", message: e instanceof Error ? e.message : String(e) };
        }
      },
    },
    folder: {
      execute: async (ctx) => {
        if (!system.openFolder) {
          return { status: "failed", message: "Folder 节点：系统操作尚未接入（P7）" };
        }
        try {
          await system.openFolder(ctx.node);
          return { status: "continue" };
        } catch (e) {
          return { status: "failed", message: e instanceof Error ? e.message : String(e) };
        }
      },
    },
    checkpoint: { execute: async () => ({ status: "checkpoint" as const }) },
    finish: { execute: async () => ({ status: "continue" as const }) },
  };
}
