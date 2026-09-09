import type { CoreContext, CoreTaskCreateInput } from "../../../types";
import type { WorkflowNodeDefinition } from "../domain/nodeDefinition";

export type WorkflowTaskOps = Pick<CoreContext["tasks"], "createWithId" | "complete">;

const ports = [
  { id: "in", direction: "input" as const, maxConnections: 1 },
  { id: "out", direction: "output" as const, maxConnections: 1 },
];

export function createDailyFlowNodeDefinitions(tasks: WorkflowTaskOps): WorkflowNodeDefinition[] {
  const createTask: WorkflowNodeDefinition = {
    type: "dailyflow.create-task", version: 1, category: "dailyflow", title: "创建任务",
    capabilities: ["tasks.write"], ports, idempotent: false,
    configSchema: { fields: [
      { key: "title", label: "任务标题", type: "text", required: true },
      { key: "scheduledDate", label: "计划日期", type: "text" },
    ] },
    validate: (config, context) => typeof config.title === "string" && config.title.trim()
      ? []
      : [{ code: "dailyflow.task-title-required", message: "请填写任务标题", severity: "error", nodeId: context.node.id, field: "title" }],
    preview: async (config, context) => [{ id: `${context.node.id}:task`, nodeId: context.node.id, kind: "task-change", title: `创建任务：${String(config.title)}` }],
    execute: async (config) => {
      const input: CoreTaskCreateInput = { title: String(config.title) };
      if (typeof config.scheduledDate === "string" && config.scheduledDate) input.scheduledDate = config.scheduledDate;
      const result = await tasks.createWithId(input);
      return result.ok ? { status: "completed", output: { taskId: result.id } } : { status: "failed", message: "任务创建失败", retryable: true };
    },
  };

  const completeTask: WorkflowNodeDefinition = {
    type: "dailyflow.complete-task", version: 1, category: "dailyflow", title: "完成关联任务",
    capabilities: ["tasks.write"], ports, idempotent: true,
    configSchema: { fields: [] },
    validate: (_config, context) => context.node ? [] : [],
    preview: async (_config, context) => [{ id: `${context.node.id}:complete`, nodeId: context.node.id, kind: "task-change", title: "完成关联任务" }],
    execute: async (_config, context) => {
      if (context.taskId == null) return { status: "failed", message: "当前运行未关联任务", retryable: false };
      return (await tasks.complete(context.taskId)) ? { status: "completed" } : { status: "failed", message: "关联任务不存在或已删除", retryable: false };
    },
  };

  return [createTask, completeTask];
}
