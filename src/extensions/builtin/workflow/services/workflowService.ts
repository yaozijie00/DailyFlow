import type { Db } from "../../../../db/db";
import { WorkflowRepository } from "../repository/workflowRepository";
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowRun } from "../models";

/**
 * Workflow Service（UI ↔ Repository 桥）。
 * Repository 经注入的 Db（Storage API）访问 Core 库中 Workflow 专属表。
 */

let repoPromise: Promise<WorkflowRepository> | null = null;

function repo(): Promise<WorkflowRepository> {
  if (!repoPromise) {
    repoPromise = import("../../../../db/db").then((m) => {
      const db: Db = m.getDb();
      return new WorkflowRepository(db);
    });
  }
  return repoPromise;
}

export interface WorkflowMetaInput {
  name: string;
  description?: string;
  tags?: string[];
}

export const workflowService = {
  list: () => repo().then((r) => r.list()),

  get: (id: string) => repo().then((r) => r.get(id)),

  create: (input: WorkflowMetaInput & { nodes?: Workflow["nodes"]; edges?: Workflow["edges"] }) =>
    repo().then((r) =>
      r.create({ name: input.name, description: input.description, tags: input.tags, nodes: input.nodes, edges: input.edges }),
    ),

  updateMeta: (id: string, input: WorkflowMetaInput) =>
    repo().then((r) => r.update(id, { name: input.name, description: input.description, tags: input.tags })),

  /** 画布保存：替换节点/边（保留名称等元数据，version+1）。 */
  saveGraph: (id: string, nodes: WorkflowNode[], edges: WorkflowEdge[]) =>
    repo().then((r) => r.update(id, { nodes, edges })),

  remove: (id: string) => repo().then((r) => r.delete(id)),

  duplicate: (id: string) => repo().then((r) => r.duplicate(id)),

  // ---- 运行（P6 完整接入；先暴露仓库能力） ----
  createRun: (workflowId: string, taskId?: number | null) =>
    repo().then((r) => r.createRun(workflowId, taskId ?? null)),

  getRun: (runId: string): Promise<WorkflowRun | null> => repo().then((r) => r.getRun(runId)),
};
