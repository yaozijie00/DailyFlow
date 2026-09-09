import type { WorkflowNodeDefinition } from "./nodeDefinition";

const NODE_TYPE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export class WorkflowNodeRegistry {
  private readonly definitions = new Map<string, WorkflowNodeDefinition>();

  register(definition: WorkflowNodeDefinition): void {
    if (!NODE_TYPE_PATTERN.test(definition.type)) {
      throw new Error(`Workflow 节点类型必须使用命名空间格式：${definition.type}`);
    }
    if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
      throw new Error(`Workflow 节点版本必须是正整数：${definition.type}`);
    }
    if (this.definitions.has(definition.type)) {
      throw new Error(`重复节点类型：${definition.type}`);
    }

    this.definitions.set(definition.type, {
      ...definition,
      capabilities: [...new Set(definition.capabilities)],
      ports: definition.ports.map((port) => ({ ...port })),
      configSchema: {
        ...definition.configSchema,
        fields: definition.configSchema.fields.map((field) => ({ ...field })),
      },
    });
  }

  get(type: string): WorkflowNodeDefinition | undefined {
    return this.definitions.get(type);
  }

  require(type: string): WorkflowNodeDefinition {
    const definition = this.get(type);
    if (!definition) throw new Error(`未注册的 Workflow 节点：${type}`);
    return definition;
  }

  list(): WorkflowNodeDefinition[] {
    return [...this.definitions.values()].sort(
      (left, right) => left.category.localeCompare(right.category) || left.title.localeCompare(right.title),
    );
  }
}
