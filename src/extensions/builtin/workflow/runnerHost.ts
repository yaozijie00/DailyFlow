import { createWorkflowRunner, type WorkflowRunner } from "./services/workflowRunner";
import { WorkflowRepository } from "./repository/workflowRepository";
import { runnerSystemOps, workflowSystemOps } from "./systemOps";
import { createWorkflowRunnerV2 } from "./services/workflowRunnerV2";
import { createBuiltInNodeRegistry } from "./nodes/builtInRegistry";
import type { WorkflowTaskOps } from "./nodes/dailyFlowNodes";
import { getWorkflowPreferences } from "./preferences";
import { workflowService } from "./services/workflowService";
import type { WorkflowVariableValues } from "./domain/types";

/**
 * Runner Host（生产单例）：懒加载 Core Db 注入 Repository；
 * 系统操作（app/file/folder）经 Tauri invoke（P7）注入；
 * 任务完成（P8）由 Extension 激活时经 CoreContext 注入（setTaskCompleter）。
 */
let runner: WorkflowRunner | null = null;
let repo: WorkflowRepository | null = null;
let taskCompleter: ((taskId: number) => Promise<void>) | null = null;
let workflowTaskOps: WorkflowTaskOps | null = null;

/** Extension activate(ctx) 时调用：把 ctx.tasks.complete 适配成 runner 可用的完成器；传 null 清除（deactivate）。 */
export function setTaskCompleter(fn: ((taskId: number) => Promise<void>) | null): void {
  taskCompleter = fn;
  runner = null; // 下次 get 时按新完成器重建
}

export function setWorkflowTaskOps(ops: WorkflowTaskOps | null): void {
  workflowTaskOps = ops;
}

async function get(): Promise<WorkflowRunner> {
  if (!runner) {
    if (!repo) {
      const { getDb } = await import("../../../db/db");
      repo = new WorkflowRepository(getDb());
    }
    runner = createWorkflowRunner(repo, {
      ...runnerSystemOps,
      ...(taskCompleter ? { completeTask: taskCompleter } : {}),
    });
  }
  return runner;
}

export const workflowRunnerHost = {
  start: (workflowId: string, taskId?: number | null) =>
    get().then((r) => r.start(workflowId, taskId ?? null)),
  resume: (runId: string) => get().then((r) => r.resume(runId)),
  confirmFinish: (runId: string) => get().then((r) => r.confirmFinish(runId)),
  cancel: (runId: string) => get().then((r) => r.cancel(runId)),
};

async function getV2Runner() {
  if (!repo) {
    const { getDb } = await import("../../../db/db");
    repo = new WorkflowRepository(getDb());
  }
  const registry = createBuiltInNodeRegistry({
    allowCommandExecution: getWorkflowPreferences().enableCommandNodes,
    ...(workflowTaskOps ? { tasks: workflowTaskOps } : {}),
  });
  return createWorkflowRunnerV2(repo, registry, {
    ...(workflowTaskOps
      ? {
          completeTask: async (taskId: number) => {
            if (!(await workflowTaskOps!.complete(taskId))) throw new Error("关联任务不存在或已删除");
          },
        }
      : {}),
  });
}

export const workflowRunnerV2Host = {
  plan: async (workflowId: string, variables: WorkflowVariableValues = {}) => {
    await workflowService.prepareTemplateForRun(workflowId);
    return (await getV2Runner()).plan(workflowId, variables);
  },
  start: async (input: { workflowId: string; variables?: WorkflowVariableValues; taskId?: number | null }) => {
    await workflowService.prepareTemplateForRun(input.workflowId);
    return (await getV2Runner()).start(input);
  },
  resume: async (runId: string) => (await getV2Runner()).resume(runId),
  retry: async (runId: string) => (await getV2Runner()).retry(runId),
  confirmFinish: async (runId: string) => (await getV2Runner()).confirmFinish(runId),
  cancel: async (runId: string) => (await getV2Runner()).cancel(runId),
};

export { workflowSystemOps };
