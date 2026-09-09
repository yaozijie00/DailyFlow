import type { ExtensionStorage, JsonValue } from "../../../types";
import { newEdgeId, newNodeId, newWorkflowId } from "../models";
import type { WorkflowRepository } from "../repository/workflowRepository";
import type { WorkflowV2 } from "../domain/types";
import { getBuiltInWorkflowTemplates } from "./builtIns";

export type WorkflowTemplateSource = "builtin" | "personal";

export interface WorkflowTemplate extends WorkflowV2 {
  source: WorkflowTemplateSource;
  readOnly: boolean;
  favorite: boolean;
  lastUsedAt?: number;
}

export interface WorkflowTemplateQuery {
  search?: string;
  source?: WorkflowTemplateSource | "all";
  favorite?: boolean;
  tag?: string;
  sort?: "recent" | "updated" | "name";
}

export interface WorkflowTemplateMetadata {
  favorite?: boolean;
  lastUsedAt?: number;
}

export interface WorkflowTemplateMetadataStore {
  load(): Promise<Record<string, WorkflowTemplateMetadata>>;
  save(value: Record<string, WorkflowTemplateMetadata>): Promise<void>;
}

const emptyMetadataStore: WorkflowTemplateMetadataStore = {
  load: async () => ({}),
  save: async () => undefined,
};

function withMetadata(
  workflow: WorkflowV2,
  source: WorkflowTemplateSource,
  metadata: WorkflowTemplateMetadata | undefined,
): WorkflowTemplate {
  return {
    ...structuredClone(workflow),
    source,
    readOnly: source === "builtin",
    favorite: metadata?.favorite === true,
    ...(metadata?.lastUsedAt !== undefined ? { lastUsedAt: metadata.lastUsedAt } : {}),
  };
}

function matches(template: WorkflowTemplate, query: WorkflowTemplateQuery): boolean {
  if (query.source && query.source !== "all" && template.source !== query.source) return false;
  if (query.favorite === true && !template.favorite) return false;
  if (query.tag && !template.tags.includes(query.tag)) return false;
  const search = query.search?.trim().toLocaleLowerCase();
  if (!search) return true;
  return [template.name, template.description ?? "", ...template.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(search);
}

export function createExtensionTemplateMetadataStore(
  storage: ExtensionStorage,
): WorkflowTemplateMetadataStore {
  const key = "template-metadata";
  return {
    load: async () => {
      const value = await storage.get<Record<string, JsonValue>>(key);
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const output: Record<string, WorkflowTemplateMetadata> = {};
      for (const [id, entry] of Object.entries(value)) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const object = entry as Record<string, JsonValue>;
        output[id] = {
          ...(typeof object.favorite === "boolean" ? { favorite: object.favorite } : {}),
          ...(typeof object.lastUsedAt === "number" ? { lastUsedAt: object.lastUsedAt } : {}),
        };
      }
      return output;
    },
    save: (value) => storage.set(key, value as unknown as JsonValue),
  };
}

export class WorkflowTemplateService {
  constructor(
    private readonly repo: WorkflowRepository,
    private readonly metadataStore: WorkflowTemplateMetadataStore = emptyMetadataStore,
    private readonly now: () => number = Date.now,
  ) {}

  private async metadata(): Promise<Record<string, WorkflowTemplateMetadata>> {
    return this.metadataStore.load();
  }

  async get(id: string): Promise<WorkflowTemplate | null> {
    const metadata = await this.metadata();
    const builtIn = getBuiltInWorkflowTemplates().find((item) => item.id === id);
    if (builtIn) return withMetadata(builtIn, "builtin", metadata[id]);
    const personal = await this.repo.getV2(id);
    return personal ? withMetadata(personal, "personal", metadata[id]) : null;
  }

  async list(query: WorkflowTemplateQuery = {}): Promise<WorkflowTemplate[]> {
    const [metadata, summaries] = await Promise.all([this.metadata(), this.repo.list()]);
    const personal = (await Promise.all(summaries.map((summary) => this.repo.getV2(summary.id))))
      .filter((item): item is WorkflowV2 => item !== null)
      .map((item) => withMetadata(item, "personal", metadata[item.id]));
    const templates = [
      ...getBuiltInWorkflowTemplates().map((item) => withMetadata(item, "builtin", metadata[item.id])),
      ...personal,
    ].filter((item) => matches(item, query));
    const sort = query.sort ?? "updated";
    return templates.sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "zh-CN");
      if (sort === "recent") return (right.lastUsedAt ?? 0) - (left.lastUsedAt ?? 0) || right.updatedAt - left.updatedAt;
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, "zh-CN");
    });
  }

  async duplicateForEdit(id: string): Promise<WorkflowTemplate> {
    const source = await this.get(id);
    if (!source) throw new Error(`模板不存在：${id}`);
    const workflowId = newWorkflowId();
    const nodeIds = new Map(source.nodes.map((item) => [item.id, newNodeId()]));
    const now = this.now();
    const copy: WorkflowV2 = {
      id: workflowId,
      schemaVersion: 2,
      name: source.source === "builtin" ? `${source.name}（我的副本）` : `${source.name}（副本）`,
      description: source.description,
      version: 1,
      variables: structuredClone(source.variables),
      nodes: source.nodes.map((item) => ({ ...structuredClone(item), id: nodeIds.get(item.id)! })),
      edges: source.edges.map((item) => ({
        ...structuredClone(item),
        id: newEdgeId(),
        source: nodeIds.get(item.source)!,
        target: nodeIds.get(item.target)!,
      })),
      tags: [...source.tags],
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.saveMigratedWorkflow(copy);
    return withMetadata(copy, "personal", undefined);
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    if (!(await this.get(id))) throw new Error(`模板不存在：${id}`);
    const metadata = await this.metadata();
    metadata[id] = { ...metadata[id], favorite };
    await this.metadataStore.save(metadata);
  }

  async markUsed(id: string): Promise<void> {
    if (!(await this.get(id))) throw new Error(`模板不存在：${id}`);
    const metadata = await this.metadata();
    metadata[id] = { ...metadata[id], lastUsedAt: this.now() };
    await this.metadataStore.save(metadata);
  }
}
