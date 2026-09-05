import type { WorkflowRepository } from "../repository/workflowRepository";
import type { WorkflowNode, WorkflowRun } from "../models";
import {
  runWorkflowEngine,
  createDefaultExecutors,
  type WorkflowNodeExecutor,
} from "../engine/workflowEngine";

/**
 * Workflow Runner：把 Engine 接到 WorkflowRun 持久化。
 * - start：pending → running → 执行直到 paused/completed/failed；
 * - resume：从暂停的 checkpoint 之后继续；
 * - cancel：停止本轮（保留记录）。
 * 系统操作（app/file/folder）由注入的 system 提供（P7 接 Tauri invoke）。
 */

export interface RunnerSystemOps {
  launchApp?: (node: WorkflowNode) => Promise<void>;
  openFile?: (node: WorkflowNode) => Promise<void>;
  openFolder?: (node: WorkflowNode) => Promise<void>;
  /** P8：用户确认后完成任务（Host 注入 ctx.tasks.complete 的适配；失败应抛错）。 */
  completeTask?: (taskId: number) => Promise<void>;
}

export interface RunResult {
  run: WorkflowRun;
  events: string[];
}

export interface WorkflowRunner {
  start: (workflowId: string, taskId?: number | null) => Promise<RunResult>;
  resume: (runId: string) => Promise<RunResult>;
  /** P8：Finish→Task 联动——仅当 run 处于 awaiting-confirm 时确认：先完成任务再标记 completed。 */
  confirmFinish: (runId: string) => Promise<RunResult>;
  cancel: (runId: string) => Promise<WorkflowRun | null>;
}

export function createWorkflowRunner(
  repo: WorkflowRepository,
  system: RunnerSystemOps = {},
): WorkflowRunner {
  const executors: Record<string, WorkflowNodeExecutor> = createDefaultExecutors(system);

  async function executeAndPersist(
    workflowId: string,
    runId: string,
    resumeAfterNodeId: string | null,
    startedAt: number,
    taskId: number | null,
  ): Promise<RunResult> {
    const wf = await repo.get(workflowId);
    if (!wf) throw new Error(`Workflow 不存在：${workflowId}`);
    const events: string[] = [];
    events.push(`run=${runId} started`);
    const outcome = await runWorkflowEngine(wf, executors, resumeAfterNodeId, (node) => {
      events.push(`node=${node.id} type=${node.type} title=${node.title}`);
    });
    if (outcome.state === "paused") {
      const run = await repo.updateRun(runId, {
        state: "paused",
        currentNodeId: outcome.nodeId,
        startedAt,
        completedAt: null,
      });
      events.push(`checkpoint paused at node=${outcome.nodeId}`);
      return { run: run!, events };
    }
    if (outcome.state === "completed") {
      // Finish 已到达：若本次运行关联了任务，不直接完成——等待用户确认（P8）
      if (taskId != null) {
        const finishNode = wf.nodes.find((n) => n.type === "finish");
        const run = await repo.updateRun(runId, {
          state: "awaiting-confirm",
          currentNodeId: finishNode?.id ?? null,
          startedAt,
          completedAt: null,
        });
        events.push(`finish reached; awaiting confirm to complete task=${taskId}`);
        return { run: run!, events };
      }
      const run = await repo.updateRun(runId, {
        state: "completed",
        currentNodeId: null,
        startedAt,
        completedAt: Date.now(),
      });
      events.push("workflow completed");
      return { run: run!, events };
    }
    const run = await repo.updateRun(runId, {
      state: "failed",
      currentNodeId: outcome.nodeId ?? null,
      startedAt,
      completedAt: Date.now(),
      error: { nodeId: outcome.nodeId, message: outcome.message },
    });
    events.push(`workflow failed: ${outcome.message}`);
    return { run: run!, events };
  }

  return {
    start: async (workflowId, taskId = null) => {
      const wf = await repo.get(workflowId);
      if (!wf) throw new Error(`Workflow 不存在：${workflowId}`);
      // Phase 4：同一 Workflow 已有进行中的 run（pending/running/paused/awaiting-confirm）时禁止重复启动
      if (await repo.hasActiveRun(workflowId)) {
        throw new Error("该 Workflow 已有进行中的运行，请先继续或取消它");
      }
      const created = await repo.createRun(workflowId, taskId);
      const running = await repo.updateRun(created.id, { state: "running", startedAt: Date.now() });
      return executeAndPersist(
        workflowId,
        running!.id,
        null,
        running!.startedAt ?? Date.now(),
        taskId,
      );
    },

    resume: async (runId) => {
      const run = await repo.getRun(runId);
      if (!run) throw new Error(`Run 不存在：${runId}`);
      if (run.state !== "paused" || !run.currentNodeId) {
        throw new Error(`Run 不在暂停态（当前 ${run.state}），无法恢复`);
      }
      await repo.updateRun(runId, { state: "running" });
      return executeAndPersist(
        run.workflowId,
        runId,
        run.currentNodeId,
        run.startedAt ?? Date.now(),
        run.taskId,
      );
    },

    confirmFinish: async (runId) => {
      const run = await repo.getRun(runId);
      if (!run) throw new Error(`Run 不存在：${runId}`);
      if (run.state !== "awaiting-confirm") {
        throw new Error(`Run 不在终点确认态（当前 ${run.state}），无法确认完成`);
      }
      // 顺序：先置 run completed，再完成任务——确保 ctx.tasks.complete 内触发的
      // 成就评估（A5 workflow_runs_completed 数据源）能读到本次完成；失败则回滚 run 状态。
      const done = await repo.updateRun(runId, {
        state: "completed",
        currentNodeId: null,
        completedAt: Date.now(),
      });
      if (run.taskId != null) {
        if (!system.completeTask) {
          throw new Error("任务完成能力尚未接入（P8）");
        }
        try {
          await system.completeTask(run.taskId);
        } catch (e) {
          // 任务完成失败：回滚 run 到 awaiting-confirm（可重试/取消），保留错误
          await repo.updateRun(runId, {
            state: "awaiting-confirm",
            currentNodeId: run.currentNodeId,
            completedAt: null,
          });
          throw e;
        }
      }
      return { run: done!, events: [`task=${run.taskId} confirmed & workflow completed`] };
    },

    cancel: async (runId) => {
      const run = await repo.getRun(runId);
      if (!run) throw new Error(`Run 不存在：${runId}`);
      // Phase 4：仅进行中的 run（pending/running/paused/awaiting-confirm）可取消；
      // 终态（completed/failed/cancelled）不可改写。
      const cancellable: WorkflowRun["state"][] = ["pending", "running", "paused", "awaiting-confirm"];
      if (!cancellable.includes(run.state)) {
        throw new Error(`Run 已结束（${run.state}），无法取消`);
      }
      return repo.updateRun(runId, {
        state: "cancelled",
        currentNodeId: null,
        completedAt: Date.now(),
      });
    },
  };
}
