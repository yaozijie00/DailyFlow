import type { Db } from "../../../../db/db";
import { WorkflowRepository } from "../repository/workflowRepository";
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowRun } from "../models";
import type { ExtensionStorage } from "../../../types";
import {
  createExtensionTemplateMetadataStore,
  WorkflowTemplateService,
  type WorkflowTemplateQuery,
} from "../templates/templateService";

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

export const workflowService = {
  listTemplates: (query?: WorkflowTemplateQuery) => templates().then((service) => service.list(query)),

  getTemplate: (id: string) => templates().then((service) => service.get(id)),

  duplicateTemplateForEdit: (id: string) =>
    templates().then((service) => service.duplicateForEdit(id)),

  setTemplateFavorite: (id: string, favorite: boolean) =>
    templates().then((service) => service.setFavorite(id, favorite)),

  markTemplateUsed: (id: string) => templates().then((service) => service.markUsed(id)),

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
};
