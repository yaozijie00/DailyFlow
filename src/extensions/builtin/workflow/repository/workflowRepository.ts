import { asc, eq } from "drizzle-orm";
import type { Db } from "../../../../db/db";
import {
  workflows,
  workflowNodes,
  workflowEdges,
  workflowRuns,
  workflowRunSteps,
} from "../../../../db/schema";
import {
  newWorkflowId,
  newNodeId,
  newEdgeId,
  newRunId,
  newRunStepId,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowRun,
  type WorkflowRunState,
} from "../models";
import type {
  WorkflowNodeV2,
  WorkflowRunStep,
  WorkflowRunStepState,
  WorkflowRunV2,
  WorkflowV2,
  WorkflowVariableValues,
} from "../domain/types";

/**
 * Workflow Repository（数据基础设施属 Core，业务归属本 Extension）：
 * 只通过注入的 Db（Storage API）访问 4 张 Workflow 专属表（迁移 0021），
 * 不直接触碰任何 Core 业务表。
 */

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  tags?: string[];
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface WorkflowUpdateInput {
  name?: string;
  description?: string | null;
  tags?: string[];
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapNodeRow(r: typeof workflowNodes.$inferSelect): WorkflowNode {
  return {
    id: r.id,
    type: r.type as WorkflowNode["type"],
    title: r.title,
    description: r.description ?? undefined,
    position: { x: r.positionX, y: r.positionY },
    config: safeParseJson<Record<string, unknown>>(r.configJson, {}),
  };
}

function mapEdgeRow(r: typeof workflowEdges.$inferSelect): WorkflowEdge {
  return { id: r.id, source: r.source, target: r.target };
}

function mapRunRow(r: typeof workflowRuns.$inferSelect): WorkflowRun {
  return {
    id: r.id,
    workflowId: r.workflowId,
    taskId: r.taskId,
    state: r.state as WorkflowRunState,
    currentNodeId: r.currentNodeId,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    error: safeParseJson<WorkflowRun["error"]>(r.errorJson, null),
    createdAt: r.createdAt,
  };
}

export interface WorkflowRunListQuery {
  states?: WorkflowRunState[];
  cursor?: string;
  limit?: number;
}

export interface WorkflowRunPage {
  items: WorkflowRunV2[];
  nextCursor: string | null;
}

const DELETED_WORKFLOW_TAG = "__dailyflow_deleted__";

function isDeletedWorkflow(tagsJson: string): boolean {
  return safeParseJson<string[]>(tagsJson, []).includes(DELETED_WORKFLOW_TAG);
}

function mapRunV2Row(r: typeof workflowRuns.$inferSelect): WorkflowRunV2 | null {
  if (
    r.workflowVersion === null ||
    r.workflowSnapshotJson === null ||
    r.variablesSnapshotJson === null
  ) {
    return null;
  }
  const workflowSnapshot = safeParseJson<WorkflowV2 | null>(r.workflowSnapshotJson, null);
  const variablesSnapshot = safeParseJson<WorkflowVariableValues | null>(
    r.variablesSnapshotJson,
    null,
  );
  if (!workflowSnapshot || !variablesSnapshot || workflowSnapshot.schemaVersion !== 2) return null;
  return {
    id: r.id,
    workflowId: r.workflowId,
    taskId: r.taskId,
    state: r.state as WorkflowRunV2["state"],
    currentNodeId: r.currentNodeId,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    error: safeParseJson<WorkflowRunV2["error"]>(r.errorJson, null),
    workflowVersion: r.workflowVersion,
    workflowSnapshot,
    variablesSnapshot,
    createdAt: r.createdAt,
  };
}

function mapRunStepRow(r: typeof workflowRunSteps.$inferSelect): WorkflowRunStep {
  return {
    id: r.id,
    runId: r.runId,
    nodeId: r.nodeId,
    nodeType: r.nodeType,
    sequence: r.sequence,
    state: r.state as WorkflowRunStepState,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    output: safeParseJson<Record<string, unknown> | null>(r.outputJson, null),
    error: safeParseJson<WorkflowRunStep["error"]>(r.errorJson, null),
    createdAt: r.createdAt,
  };
}

export class WorkflowRepository {
  constructor(private readonly db: Db) {}

  async create(input: WorkflowCreateInput): Promise<Workflow> {
    const now = Date.now();
    const id = newWorkflowId();
    const nodes = input.nodes ?? [];
    const edges = input.edges ?? [];
    // 结构预检（写前）：空图合法；非空图须无重复 id / 悬空边 / 自连，避免写一半失败
    this.assertGraphIntegrity(id, nodes, edges);
    await this.db
      .insert(workflows)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        version: 1,
        tagsJson: JSON.stringify(input.tags ?? []),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await this.insertNodesAndEdges(id, nodes, edges);
    return {
      id,
      name: input.name,
      description: input.description,
      version: 1,
      nodes,
      edges,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private assertV2GraphIntegrity(workflow: WorkflowV2): void {
    const ids = new Set<string>();
    for (const node of workflow.nodes) {
      if (ids.has(node.id)) throw new Error(`图包含重复节点 id：${node.id}`);
      ids.add(node.id);
    }
    for (const edge of workflow.edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) {
        throw new Error(`图包含悬空连线：${edge.source} → ${edge.target}（Workflow ${workflow.id}）`);
      }
      if (edge.source === edge.target) {
        throw new Error(`图包含自连接：${edge.source} → ${edge.source}`);
      }
    }
  }

  private async insertV2NodesAndEdges(workflow: WorkflowV2): Promise<void> {
    for (const node of workflow.nodes) {
      await this.db
        .insert(workflowNodes)
        .values({
          id: node.id,
          workflowId: workflow.id,
          type: node.type,
          typeVersion: node.typeVersion,
          title: node.title,
          description: node.description ?? null,
          positionX: Math.round(node.position.x),
          positionY: Math.round(node.position.y),
          configJson: JSON.stringify(node.config),
          createdAt: workflow.updatedAt,
        })
        .run();
    }
    for (const edge of workflow.edges) {
      await this.db
        .insert(workflowEdges)
        .values({
          id: edge.id,
          workflowId: workflow.id,
          source: edge.source,
          target: edge.target,
          sourcePort: edge.sourcePort ?? null,
          targetPort: edge.targetPort ?? null,
          createdAt: workflow.updatedAt,
        })
        .run();
    }
  }

  /** 写入已经过纯迁移与完整校验的 V2 Workflow。 */
  async saveMigratedWorkflow(workflow: WorkflowV2): Promise<WorkflowV2> {
    this.assertV2GraphIntegrity(workflow);
    const existing = await this.db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, workflow.id))
      .get();

    if (existing) {
      await this.db.delete(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)).run();
      await this.db.delete(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id)).run();
      await this.db
        .update(workflows)
        .set({
          name: workflow.name,
          description: workflow.description ?? null,
          version: workflow.version,
          schemaVersion: workflow.schemaVersion,
          variablesJson: JSON.stringify(workflow.variables),
          tagsJson: JSON.stringify(workflow.tags),
          updatedAt: workflow.updatedAt,
        })
        .where(eq(workflows.id, workflow.id))
        .run();
    } else {
      await this.db
        .insert(workflows)
        .values({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description ?? null,
          version: workflow.version,
          schemaVersion: workflow.schemaVersion,
          variablesJson: JSON.stringify(workflow.variables),
          tagsJson: JSON.stringify(workflow.tags),
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        })
        .run();
    }
    await this.insertV2NodesAndEdges(workflow);
    return structuredClone(workflow);
  }

  async getV2(id: string): Promise<WorkflowV2 | null> {
    const row = await this.db.select().from(workflows).where(eq(workflows.id, id)).get();
    if (!row || row.schemaVersion !== 2 || isDeletedWorkflow(row.tagsJson)) return null;
    const nodeRows = await this.db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, id))
      .all();
    const edgeRows = await this.db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, id))
      .all();
    return {
      id: row.id,
      schemaVersion: 2,
      name: row.name,
      description: row.description ?? undefined,
      version: row.version,
      variables: safeParseJson(row.variablesJson, []),
      nodes: nodeRows.map((node) => ({
        id: node.id,
        type: node.type,
        typeVersion: node.typeVersion,
        title: node.title,
        description: node.description ?? undefined,
        position: { x: node.positionX, y: node.positionY },
        config: safeParseJson(node.configJson, {}),
      })),
      edges: edgeRows.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(edge.sourcePort ? { sourcePort: edge.sourcePort } : {}),
        ...(edge.targetPort ? { targetPort: edge.targetPort } : {}),
      })),
      tags: safeParseJson(row.tagsJson, []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async insertNodesAndEdges(
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): Promise<void> {
    const now = Date.now();
    for (const n of nodes) {
      await this.db
        .insert(workflowNodes)
        .values({
          id: n.id,
          workflowId,
          type: n.type,
          title: n.title,
          description: n.description ?? null,
          positionX: Math.round(n.position.x),
          positionY: Math.round(n.position.y),
          configJson: JSON.stringify(n.config ?? {}),
          createdAt: now,
        })
        .run();
    }
    for (const e of edges) {
      await this.db
        .insert(workflowEdges)
        .values({
          id: e.id,
          workflowId,
          source: e.source,
          target: e.target,
          createdAt: now,
        })
        .run();
    }
  }

  async get(id: string): Promise<Workflow | null> {
    const row = await this.db.select().from(workflows).where(eq(workflows.id, id)).get();
    if (!row || isDeletedWorkflow(row.tagsJson)) return null;
    const nodeRows = await this.db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, id))
      .all();
    const edgeRows = await this.db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, id))
      .all();
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      version: row.version,
      nodes: nodeRows.map(mapNodeRow),
      edges: edgeRows.map(mapEdgeRow),
      tags: safeParseJson<string[]>(row.tagsJson, []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Library 列表（不含 nodes/edges）。 */
  async list(): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      version: number;
      tags: string[];
      updatedAt: number;
    }>
  > {
    const rows = await this.db.select().from(workflows).orderBy(workflows.updatedAt).all();
    return rows.filter((r) => !isDeletedWorkflow(r.tagsJson)).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      version: r.version,
      tags: safeParseJson<string[]>(r.tagsJson, []),
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * 更新 Workflow。
   * - 仅传元数据（name/description/tags）→ 不动图；
   * - 替换图必须 **nodes 与 edges 成对提供**（单传其一会静默复用旧图导致悬空边，予以拒绝）；
   * - 图替换 = 先删旧（nodes+edges）再插新。注意：生产 Db 经 tauri-plugin-sql 多连接池，
   *   跨语句事务不可用（见 db/migrate.ts 注释），本方法无法原子化；
   *   为缩小失败窗口：插入前先做结构预检（重复节点 id / 悬空边引用），
   *   预检失败抛错且**不删旧图**；仅预检通过后才删旧插新。
   */
  async update(id: string, input: WorkflowUpdateInput): Promise<Workflow | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const now = Date.now();
    const name = input.name ?? existing.name;
    const description =
      input.description === undefined ? existing.description ?? null : input.description;
    const tags = input.tags ?? existing.tags;
    const hasNodes = input.nodes !== undefined;
    const hasEdges = input.edges !== undefined;
    if (hasNodes !== hasEdges) {
      throw new Error("替换 Workflow 图必须同时提供 nodes 与 edges（禁止部分替换）");
    }
    const nodes = input.nodes ?? existing.nodes;
    const edges = input.edges ?? existing.edges;
    // 结构预检（写前）：重复节点 id、边引用存在的节点 —— 通过才允许进入删旧插新
    if (hasNodes) {
      this.assertGraphIntegrity(id, nodes, edges);
    }
    if (hasNodes) {
      await this.db.delete(workflowEdges).where(eq(workflowEdges.workflowId, id)).run();
      await this.db.delete(workflowNodes).where(eq(workflowNodes.workflowId, id)).run();
      await this.insertNodesAndEdges(id, nodes, edges);
    }
    await this.db
      .update(workflows)
      .set({
        name,
        description,
        version: existing.version + 1,
        tagsJson: JSON.stringify(tags),
        updatedAt: now,
      })
      .where(eq(workflows.id, id))
      .run();
    return {
      id,
      name,
      description: description ?? undefined,
      version: existing.version + 1,
      nodes,
      edges,
      tags,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  /** 图结构预检：重复节点 id、边引用必须指向本图节点（悬空边会被 Engine 拒跑）。 */
  private assertGraphIntegrity(
    workflowId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
  ): void {
    const seen = new Set<string>();
    for (const n of nodes) {
      if (seen.has(n.id)) {
        throw new Error(`图包含重复节点 id：${n.id}`);
      }
      seen.add(n.id);
    }
    for (const e of edges) {
      if (!seen.has(e.source) || !seen.has(e.target)) {
        throw new Error(
          `图包含悬空连线：${e.source} → ${e.target}（Workflow ${workflowId}）`,
        );
      }
      if (e.source === e.target) {
        throw new Error(`图包含自连接：${e.source} → ${e.source}`);
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.db.select().from(workflows).where(eq(workflows.id, id)).get();
    if (!existing) return false;
    const runRows = await this.db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, id)).all();
    const hasSnapshotHistory = runRows.some((run) => run.workflowSnapshotJson !== null);
    await this.db.delete(workflowEdges).where(eq(workflowEdges.workflowId, id)).run();
    await this.db.delete(workflowNodes).where(eq(workflowNodes.workflowId, id)).run();
    if (hasSnapshotHistory) {
      await this.db.update(workflows).set({
        description: null,
        variablesJson: "[]",
        tagsJson: JSON.stringify([DELETED_WORKFLOW_TAG]),
        updatedAt: Date.now(),
      }).where(eq(workflows.id, id)).run();
      return true;
    }
    await this.db.delete(workflowRuns).where(eq(workflowRuns.workflowId, id)).run();
    const rows = await this.db
      .delete(workflows)
      .where(eq(workflows.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /** 复制：新 Workflow（id/节点/边全新，边引用随节点重映射）。 */
  async duplicate(id: string): Promise<Workflow | null> {
    const src = await this.get(id);
    if (!src) return null;
    const now = Date.now();
    const newId = newWorkflowId();
    const nodeMap = new Map<string, string>();
    const nodes: WorkflowNode[] = src.nodes.map((n) => {
      const nid = newNodeId();
      nodeMap.set(n.id, nid);
      return { ...n, id: nid, position: { x: n.position.x + 24, y: n.position.y + 24 } };
    });
    const edges: WorkflowEdge[] = src.edges.map((e) => ({
      id: newEdgeId(),
      source: nodeMap.get(e.source) ?? e.source,
      target: nodeMap.get(e.target) ?? e.target,
    }));
    await this.db
      .insert(workflows)
      .values({
        id: newId,
        name: `${src.name}（副本）`,
        description: src.description ?? null,
        version: 1,
        tagsJson: JSON.stringify(src.tags),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await this.insertNodesAndEdges(newId, nodes, edges);
    return {
      id: newId,
      name: `${src.name}（副本）`,
      description: src.description,
      version: 1,
      nodes,
      edges,
      tags: src.tags,
      createdAt: now,
      updatedAt: now,
    };
  }

  /* ---------- WorkflowRun ---------- */

  async createRun(workflowId: string, taskId: number | null = null): Promise<WorkflowRun> {
    const now = Date.now();
    const id = newRunId();
    await this.db
      .insert(workflowRuns)
      .values({ id, workflowId, taskId, state: "pending", createdAt: now })
      .run();
    return {
      id,
      workflowId,
      taskId,
      state: "pending",
      currentNodeId: null,
      startedAt: null,
      completedAt: null,
      error: null,
      createdAt: now,
    };
  }

  async createRunWithSnapshot(
    workflow: WorkflowV2,
    variables: WorkflowVariableValues,
    taskId: number | null = null,
  ): Promise<WorkflowRunV2> {
    const now = Date.now();
    const id = newRunId();
    await this.db
      .insert(workflowRuns)
      .values({
        id,
        workflowId: workflow.id,
        taskId,
        state: "pending",
        workflowVersion: workflow.version,
        workflowSnapshotJson: JSON.stringify(workflow),
        variablesSnapshotJson: JSON.stringify(variables),
        createdAt: now,
      })
      .run();
    return {
      id,
      workflowId: workflow.id,
      taskId,
      state: "pending",
      currentNodeId: null,
      startedAt: null,
      completedAt: null,
      error: null,
      workflowVersion: workflow.version,
      workflowSnapshot: structuredClone(workflow),
      variablesSnapshot: structuredClone(variables),
      createdAt: now,
    };
  }

  async appendRunStep(
    runId: string,
    node: WorkflowNodeV2,
    sequence: number,
  ): Promise<WorkflowRunStep> {
    const step: WorkflowRunStep = {
      id: newRunStepId(),
      runId,
      nodeId: node.id,
      nodeType: node.type,
      sequence,
      state: "pending",
      startedAt: null,
      completedAt: null,
      output: null,
      error: null,
      createdAt: Date.now(),
    };
    await this.db
      .insert(workflowRunSteps)
      .values({
        id: step.id,
        runId,
        nodeId: node.id,
        nodeType: node.type,
        sequence,
        state: step.state,
        createdAt: step.createdAt,
      })
      .run();
    return step;
  }

  async updateRunStep(
    id: string,
    patch: {
      state?: WorkflowRunStepState;
      startedAt?: number | null;
      completedAt?: number | null;
      output?: Record<string, unknown> | null;
      error?: WorkflowRunStep["error"];
    },
  ): Promise<WorkflowRunStep | null> {
    const rows = await this.db
      .update(workflowRunSteps)
      .set({
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.output !== undefined
          ? { outputJson: patch.output === null ? null : JSON.stringify(patch.output) }
          : {}),
        ...(patch.error !== undefined
          ? { errorJson: patch.error === null ? null : JSON.stringify(patch.error) }
          : {}),
      })
      .where(eq(workflowRunSteps.id, id))
      .returning()
      .all();
    return rows[0] ? mapRunStepRow(rows[0]) : null;
  }

  async listRunSteps(runId: string): Promise<WorkflowRunStep[]> {
    const rows = await this.db
      .select()
      .from(workflowRunSteps)
      .where(eq(workflowRunSteps.runId, runId))
      .orderBy(asc(workflowRunSteps.sequence))
      .all();
    return rows.map(mapRunStepRow);
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const row = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
    return row ? mapRunRow(row) : null;
  }

  async getRunV2(id: string): Promise<WorkflowRunV2 | null> {
    const row = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
    return row ? mapRunV2Row(row) : null;
  }

  /** V2 专用重试入口。只有带快照的失败运行可以重新进入 running。 */
  async retryFailedRun(id: string): Promise<WorkflowRunV2 | null> {
    const current = await this.getRunV2(id);
    if (!current) return null;
    if (current.state !== "failed") {
      throw new Error(`Run 不在失败态（当前 ${current.state}），无法重试`);
    }
    const rows = await this.db
      .update(workflowRuns)
      .set({ state: "running", completedAt: null, errorJson: null })
      .where(eq(workflowRuns.id, id))
      .returning()
      .all();
    return rows[0] ? mapRunV2Row(rows[0]) : null;
  }

  /**
   * WorkflowRun 状态机合法转换白名单（Phase 4：非法转换在 Repository 层即被拒绝，
   * 与 Runner 层守卫双保险）：
   * pending → running|cancelled
   * running → paused|awaiting-confirm|completed|failed|cancelled
   * paused → running|cancelled
   * awaiting-confirm → completed|cancelled
   * completed → awaiting-confirm（仅 confirmFinish 补偿回滚：completeTask 失败时还原，run 未向用户展示完成）
   * failed/cancelled = 终态（不可再转换）
   */
  private static readonly RUN_STATE_TRANSITIONS: Record<
    WorkflowRunState,
    readonly WorkflowRunState[]
  > = {
    pending: ["running", "cancelled"],
    running: ["paused", "awaiting-confirm", "completed", "failed", "cancelled"],
    paused: ["running", "cancelled"],
    "awaiting-confirm": ["completed", "cancelled"],
    completed: ["awaiting-confirm"],
    failed: [],
    cancelled: [],
  };

  async updateRun(
    id: string,
    patch: {
      state?: WorkflowRunState;
      currentNodeId?: string | null;
      startedAt?: number | null;
      completedAt?: number | null;
      error?: WorkflowRun["error"];
    },
  ): Promise<WorkflowRun | null> {
    if (patch.state !== undefined) {
      const current = await this.db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, id))
        .get();
      if (!current) return null;
      const from = current.state as WorkflowRunState;
      const allowed = WorkflowRepository.RUN_STATE_TRANSITIONS[from] ?? [];
      if (!allowed.includes(patch.state)) {
        throw new Error(`非法状态转换：${from} → ${patch.state}（run ${id}）`);
      }
    }
    const row = await this.db
      .update(workflowRuns)
      .set({
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.currentNodeId !== undefined ? { currentNodeId: patch.currentNodeId } : {}),
        ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.error !== undefined
          ? { errorJson: patch.error ? JSON.stringify(patch.error) : null }
          : {}),
      })
      .where(eq(workflowRuns.id, id))
      .returning()
      .all();
    return row[0] ? mapRunRow(row[0]) : null;
  }

  /** 查询该 Workflow 是否存在「进行中」的 run（pending/running/paused/awaiting-confirm）。 */
  async hasActiveRun(workflowId: string): Promise<boolean> {
    const active: WorkflowRunState[] = ["pending", "running", "paused", "awaiting-confirm"];
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .all();
    return rows.some((r) => active.includes(r.state as WorkflowRunState));
  }

  async listRunsForWorkflow(workflowId: string): Promise<WorkflowRun[]> {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(workflowRuns.createdAt)
      .all();
    return rows.map(mapRunRow);
  }

  async listRuns(query: WorkflowRunListQuery = {}): Promise<WorkflowRunPage> {
    const active = new Set<WorkflowRunState>(["pending", "running", "paused", "awaiting-confirm"]);
    const rows = await this.db.select().from(workflowRuns).all();
    const states = query.states ? new Set(query.states) : null;
    const ordered = rows
      .map(mapRunV2Row)
      .filter((run): run is WorkflowRunV2 => run !== null && (!states || states.has(run.state)))
      .sort((a, b) => {
        const activeDifference = Number(active.has(b.state)) - Number(active.has(a.state));
        return activeDifference || b.createdAt - a.createdAt || b.id.localeCompare(a.id);
      });
    const limit = Math.max(1, Math.min(query.limit ?? 30, 100));
    const cursorIndex = query.cursor ? ordered.findIndex((run) => run.id === query.cursor) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const items = ordered.slice(start, start + limit);
    return {
      items,
      nextCursor: start + limit < ordered.length ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async listActiveRuns(): Promise<WorkflowRun[]> {
    const active: WorkflowRunState[] = ["pending", "running", "paused", "awaiting-confirm"];
    const rows = await this.db.select().from(workflowRuns).orderBy(workflowRuns.createdAt).all();
    return rows
      .filter((row) => active.includes(row.state as WorkflowRunState))
      .map(mapRunRow)
      .reverse();
  }

  /** 全部已完成的 WorkflowRun 数（A5 成就数据源；跨全部 Workflow）。 */
  async countCompletedRuns(): Promise<number> {
    const rows = await this.db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.state, "completed"))
      .all();
    return rows.length;
  }

  /** 幂等建唯一性辅助：查找「同名 workflow」（Library 去重提示用）。 */
  async findByName(name: string): Promise<Workflow | null> {
    const row = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.name, name))
      .limit(1)
      .get();
    return row ? this.get(row.id) : null;
  }
}
