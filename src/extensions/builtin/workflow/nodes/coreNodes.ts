import type { WorkflowNodeDefinition, WorkflowNodePortDefinition } from "../domain/nodeDefinition";

const inputPort: WorkflowNodePortDefinition = {
  id: "in",
  direction: "input",
  maxConnections: 1,
};
const outputPort: WorkflowNodePortDefinition = {
  id: "out",
  direction: "output",
  maxConnections: 1,
};

function passiveNode(input: {
  type: string;
  title: string;
  description: string;
  ports: WorkflowNodePortDefinition[];
}): WorkflowNodeDefinition {
  return {
    type: input.type,
    version: 1,
    category: "flow",
    title: input.title,
    description: input.description,
    capabilities: [],
    ports: input.ports,
    configSchema: { fields: [] },
    idempotent: true,
    validate: () => [],
    preview: async () => [],
    execute: async () => ({ status: "completed" }),
  };
}

export const startNodeDefinition = passiveNode({
  type: "core.start",
  title: "开始",
  description: "Workflow 的唯一入口",
  ports: [outputPort],
});

export const manualStepNodeDefinition: WorkflowNodeDefinition = {
  ...passiveNode({
    type: "core.manual-step",
    title: "人工步骤",
    description: "记录需要由用户完成的操作",
    ports: [inputPort, outputPort],
  }),
  configSchema: {
    fields: [
      {
        key: "instructions",
        label: "操作说明",
        type: "textarea",
        required: true,
      },
    ],
  },
  validate: (config, context) =>
    typeof config.instructions === "string" && config.instructions.trim()
      ? []
      : [
          {
            code: "manual-step.instructions-required",
            message: "请填写人工步骤说明",
            severity: "error",
            nodeId: context.node.id,
            field: "instructions",
          },
        ],
  preview: async (config, context) => [
    {
      id: `${context.node.id}:manual`,
      nodeId: context.node.id,
      kind: "manual-step",
      title: context.node.title,
      description: typeof config.instructions === "string" ? config.instructions : undefined,
    },
  ],
};

export const checkpointNodeDefinition: WorkflowNodeDefinition = {
  ...passiveNode({
    type: "core.checkpoint",
    title: "等待确认",
    description: "暂停运行并等待用户确认",
    ports: [inputPort, outputPort],
  }),
  execute: async () => ({ status: "paused" }),
};

export const finishNodeDefinition = passiveNode({
  type: "core.finish",
  title: "完成",
  description: "Workflow 的唯一出口",
  ports: [inputPort],
});

export const CORE_NODE_DEFINITIONS: WorkflowNodeDefinition[] = [
  startNodeDefinition,
  manualStepNodeDefinition,
  checkpointNodeDefinition,
  finishNodeDefinition,
];
