import type { Db } from "../../../../db/db";
import { WorkflowRepository } from "../repository/workflowRepository";
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowRun } from "../models";
import { newEdgeId, newNodeId, newWorkflowId } from "../models";
import type { ExtensionStorage } from "../../../types";
import {
  createExtensionTemplateMetadataStore,
  WorkflowTemplateService,
  type WorkflowTemplateQuery,
} from "../templates/templateService";
import type { WorkflowRunListQuery } from "../repository/workflowRepository";
import type { WorkflowRunStep, WorkflowRunV2 } from "../domain/types";

/**
 * Workflow Service（UI ↔ Repository 桥）。
 * Repository 经注入的 Db（Storage API）访问 Core 库中 Workflow 专属表。
 */

let repoPromise: Promise<WorkflowRepository> | null = null;
let templateStorage: ExtensionStorage | null = null;
let templateServicePromise: Promise<WorkflowTemplateService> | null = null;

function repo(): Promise<WorkflowRepository> {
  if (!repoPromise) {
    repoPromise = import("../../../../db/db").then((m) => {
      const db: Db = m.getDb();
      return new WorkflowRepository(db);
    });
  }
  return repoPromise;
}

function templates(): Promise<WorkflowTemplateService> {
  if (!templateServicePromise) {
    templateServicePromise = repo().then(
      (repository) =>
        new WorkflowTemplateService(
          repository,
          templateStorage ? createExtensionTemplateMetadataStore(templateStorage) : undefined,
        ),
    );
  }
  return templateServicePromise;
}

export function setWorkflowTemplateStorage(storage: ExtensionStorage | null): void {
  templateStorage = storage;
  templateServicePromise = null;
}

export interface WorkflowMetaInput {
  name: string;
  description?: string;
  tags?: string[];
}

export interface WorkflowRunDetail {
  run: WorkflowRunV2;
  steps: WorkflowRunStep[];
  workflowName: string;
  templateDeleted: boolean;
}

async function runDetail(repository: WorkflowRepository, run: WorkflowRunV2): Promise<WorkflowRunDetail> {
  return {
    run,
    steps: await repository.listRunSteps(run.id),
    workflowName: run.workflowSnapshot.name,
    templateDeleted: (await repository.getV2(run.workflowId)) === null,
  };
}

export const workflowService = {
  listTemplates: (query?: WorkflowTemplateQuery) => templates().then((service) => service.list(query)),

  getTemplate: (id: string) => templates().then((service) => service.get(id)),

  duplicateTemplateForEdit: (id: string) =>
    templates().then((service) => service.duplicateForEdit(id)),

  setTemplateFavorite: (id: string, favorite: boolean) =>
    templates().then((service) => service.setFavorite(id, favorite)),

  markTemplateUsed: (id: string) => templates().then((service) => service.markUsed(id)),

  createTemplate: async (input: WorkflowMetaInput) => {
    const repository = await repo();
    const now = Date.now();
    const startId = newNodeId();
    const finishId = newNodeId();
    const workflow = {
      id: newWorkflowId(),
      schemaVersion: 2 as const,
      name: input.name,
      description: input.description,
      version: 1,
      variables: [],
      nodes: [
        { id: startId, type: "core.start", typeVersion: 1, title: "开始", position: { x: 80, y: 120 }, config: {} },
        { id: finishId, type: "core.finish", typeVersion: 1, title: "完成", position: { x: 440, y: 120 }, config: {} },
      ],
      edges: [{ id: newEdgeId(), source: startId, target: finishId, sourcePort: "out", targetPort: "in" }],
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await repository.saveMigratedWorkflow(workflow);
    return workflow;
  },

  saveTemplate: (workflow: import("../domain/types").WorkflowV2) =>
    repo().then((repository) => repository.saveMigratedWorkflow(workflow)),

  prepareTemplateForRun: async (id: string) => {
    const [repository, service] = await Promise.all([repo(), templates()]);
    const template = await service.get(id);
    if (!template) throw new Error(`模板不存在：${id}`);
    const workflow = {
      id: template.id,
      schemaVersion: template.schemaVersion,
      name: template.name,
      description: template.description,
      version: template.version,
      variables: template.variables,
      nodes: template.nodes,
      edges: template.edges,
      tags: template.tags,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
    if (template.source === "builtin" && !(await repository.getV2(id))) {
      await repository.saveMigratedWorkflow(workflow);
    }
    return workflow;
  },

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

  listActiveRuns: () => repo().then((r) => r.listActiveRuns()),

  listRunDetails: async (query: WorkflowRunListQuery = {}) => {
    const repository = await repo();
    const page = await repository.listRuns(query);
    return {
      items: await Promise.all(page.items.map((run) => runDetail(repository, run))),
      nextCursor: page.nextCursor,
    };
  },

  getRunDetail: async (runId: string) => {
    const repository = await repo();
    const run = await repository.getRunV2(runId);
    return run ? runDetail(repository, run) : null;
  },
};
