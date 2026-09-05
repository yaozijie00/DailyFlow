import { createWorkflowRunner, type WorkflowRunner } from "./services/workflowRunner";
import { WorkflowRepository } from "./repository/workflowRepository";
import { runnerSystemOps, workflowSystemOps } from "./systemOps";

/**
 * Runner Host（生产单例）：懒加载 Core Db 注入 Repository；
 * 系统操作（app/file/folder）经 Tauri invoke（P7）注入；
 * 任务完成（P8）由 Extension 激活时经 CoreContext 注入（setTaskCompleter）。
 */
let runner: WorkflowRunner | null = null;
let repo: WorkflowRepository | null = null;
let taskCompleter: ((taskId: number) => Promise<void>) | null = null;

/** Extension activate(ctx) 时调用：把 ctx.tasks.complete 适配成 runner 可用的完成器；传 null 清除（deactivate）。 */
export function setTaskCompleter(fn: ((taskId: number) => Promise<void>) | null): void {
  taskCompleter = fn;
  runner = null; // 下次 get 时按新完成器重建
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

export { workflowSystemOps };
