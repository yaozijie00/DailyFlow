import type { WorkflowNodeRegistry } from "../domain/nodeRegistry";
import { planWorkflow, validateAndOrderWorkflowGraph } from "../domain/planner";
import type {
  WorkflowPlan,
  WorkflowRunStep,
  WorkflowRunV2,
  WorkflowVariableValues,
} from "../domain/types";
import { resolveConfigTemplates } from "../domain/variables";
import type { WorkflowRepository } from "../repository/workflowRepository";

export interface StartWorkflowRunInput {
  workflowId: string;
  variables?: WorkflowVariableValues;
  taskId?: number | null;
}

export interface WorkflowRunDetailV2 {
  run: WorkflowRunV2;
  steps: WorkflowRunStep[];
  events: string[];
}

export interface WorkflowRunnerV2 {
  plan(workflowId: string, variables?: WorkflowVariableValues): Promise<WorkflowPlan>;
  start(input: StartWorkflowRunInput): Promise<WorkflowRunDetailV2>;
  resume(runId: string): Promise<WorkflowRunDetailV2>;
  retry(runId: string): Promise<WorkflowRunDetailV2>;
  confirmFinish(runId: string): Promise<WorkflowRunDetailV2>;
  cancel(runId: string): Promise<WorkflowRunDetailV2>;
}

export interface WorkflowRunnerV2Options {
  completeTask?: (taskId: number) => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkflowRunnerV2(
  repo: WorkflowRepository,
  registry: WorkflowNodeRegistry,
  options: WorkflowRunnerV2Options = {},
): WorkflowRunnerV2 {
  async function detail(runId: string, events: string[]): Promise<WorkflowRunDetailV2> {
    const run = await repo.getRunV2(runId);
    if (!run) throw new Error(`V2 Run 不存在：${runId}`);
    return { run, steps: await repo.listRunSteps(runId), events };
  }

  async function execute(runId: string): Promise<WorkflowRunDetailV2> {
    const run = await repo.getRunV2(runId);
    if (!run) throw new Error(`V2 Run 不存在：${runId}`);
    if (run.state !== "running") {
      throw new Error(`Run 不在运行态（当前 ${run.state}），无法执行`);
    }

    const graph = validateAndOrderWorkflowGraph(run.workflowSnapshot);
    if (graph.issues.some((issue) => issue.severity === "error")) {
      throw new Error(graph.issues.map((issue) => issue.message).join("；"));
    }
    let steps = await repo.listRunSteps(runId);
    if (steps.length === 0) {
      for (const [sequence, node] of graph.order.entries()) {
        await repo.appendRunStep(runId, node, sequence);
      }
      steps = await repo.listRunSteps(runId);
    }

    const events: string[] = [];
    for (const step of steps) {
      if (step.state === "completed" || step.state === "skipped") continue;
      const node = graph.order[step.sequence];
      if (!node || node.id !== step.nodeId) {
        throw new Error(`运行快照与步骤日志不一致：${step.nodeId}`);
      }
      const definition = registry.require(node.type);
      const resolved = resolveConfigTemplates(
        node.config,
        run.variablesSnapshot,
        run.workflowSnapshot.variables,
      );
      if (!resolved.ok) {
        const message = resolved.issues.map((issue) => issue.message).join("；");
        await repo.updateRunStep(step.id, {
          state: "failed",
          completedAt: Date.now(),
          error: { message, retryable: false },
        });
        await repo.updateRun(runId, {
          state: "failed",
          currentNodeId: node.id,
          completedAt: Date.now(),
          error: { nodeId: node.id, message },
        });
        events.push(`node=${node.id} failed: ${message}`);
        return detail(runId, events);
      }

      const startedAt = Date.now();
      await repo.updateRunStep(step.id, {
        state: "running",
        startedAt,
        completedAt: null,
        error: null,
      });
      await repo.updateRun(runId, { currentNodeId: node.id });
      events.push(`node=${node.id} type=${node.type} started`);
      try {
        const result = await definition.execute(resolved.value, {
          workflow: run.workflowSnapshot,
          node,
          variables: run.variablesSnapshot,
          resolvedConfig: resolved.value,
          trace: events,
          taskId: run.taskId,
        });
        const completedAt = Date.now();
        if (result.status === "failed") {
          const message = result.message ?? `节点「${node.title}」执行失败`;
          await repo.updateRunStep(step.id, {
            state: "failed",
            completedAt,
            output: result.output ?? null,
            error: { message, retryable: result.retryable ?? false },
          });
          await repo.updateRun(runId, {
            state: "failed",
            currentNodeId: node.id,
            completedAt,
            error: { nodeId: node.id, message },
          });
          events.push(`node=${node.id} failed: ${message}`);
          return detail(runId, events);
        }
        await repo.updateRunStep(step.id, {
          state: "completed",
          completedAt,
          output: result.output ?? null,
          error: null,
        });
        events.push(`node=${node.id} completed`);
        if (result.status === "paused") {
          await repo.updateRun(runId, {
            state: "paused",
            currentNodeId: node.id,
            completedAt: null,
          });
          return detail(runId, events);
        }
      } catch (error) {
        const message = messageOf(error);
        const completedAt = Date.now();
        await repo.updateRunStep(step.id, {
          state: "failed",
          completedAt,
          error: { message, retryable: true },
        });
        await repo.updateRun(runId, {
          state: "failed",
          currentNodeId: node.id,
          completedAt,
          error: { nodeId: node.id, message },
        });
        events.push(`node=${node.id} failed: ${message}`);
        return detail(runId, events);
      }
    }

    if (run.taskId !== null) {
      const finishNode = graph.order[graph.order.length - 1];
      await repo.updateRun(runId, {
        state: "awaiting-confirm",
        currentNodeId: finishNode?.id ?? null,
        completedAt: null,
      });
      events.push(`finish reached; awaiting confirm for task=${run.taskId}`);
    } else {
      await repo.updateRun(runId, {
        state: "completed",
        currentNodeId: null,
        completedAt: Date.now(),
      });
      events.push("workflow completed");
    }
    return detail(runId, events);
  }

  return {
    plan: async (workflowId, variables = {}) => {
      const workflow = await repo.getV2(workflowId);
      if (!workflow) throw new Error(`V2 Workflow 不存在：${workflowId}`);
      return planWorkflow(workflow, variables, registry);
    },

    start: async ({ workflowId, variables = {}, taskId = null }) => {
      const workflow = await repo.getV2(workflowId);
      if (!workflow) throw new Error(`V2 Workflow 不存在：${workflowId}`);
      if (await repo.hasActiveRun(workflowId)) {
        throw new Error("该 Workflow 已有进行中的运行，请先继续或取消它");
      }
      const plan = await planWorkflow(workflow, variables, registry);
      if (!plan.executable) {
        throw new Error(plan.issues.map((issue) => issue.message).join("；"));
      }
      const created = await repo.createRunWithSnapshot(workflow, plan.variables, taskId);
      await repo.updateRun(created.id, { state: "running", startedAt: Date.now() });
      return execute(created.id);
    },

    resume: async (runId) => {
      const run = await repo.getRunV2(runId);
      if (!run) throw new Error(`V2 Run 不存在：${runId}`);
      if (run.state !== "paused") {
        throw new Error(`Run 不在暂停态（当前 ${run.state}），无法恢复`);
      }
      await repo.updateRun(runId, { state: "running", error: null });
      return execute(runId);
    },

    retry: async (runId) => {
      const run = await repo.getRunV2(runId);
      if (!run) throw new Error(`V2 Run 不存在：${runId}`);
      if (run.state !== "failed") {
        throw new Error(`Run 不在失败态（当前 ${run.state}），无法重试`);
      }
      const failedStep = (await repo.listRunSteps(runId)).find((step) => step.state === "failed");
      if (!failedStep) throw new Error("Run 没有可重试的失败步骤");
      if (failedStep.error?.retryable !== true) throw new Error("该失败步骤不可重试");
      await repo.updateRunStep(failedStep.id, {
        state: "pending",
        startedAt: null,
        completedAt: null,
        output: null,
        error: null,
      });
      await repo.retryFailedRun(runId);
      return execute(runId);
    },

    confirmFinish: async (runId) => {
      const run = await repo.getRunV2(runId);
      if (!run) throw new Error(`V2 Run 不存在：${runId}`);
      if (run.state !== "awaiting-confirm") {
        throw new Error(`Run 不在终点确认态（当前 ${run.state}），无法确认完成`);
      }
      if (run.taskId !== null) {
        if (!options.completeTask) throw new Error("任务完成能力尚未接入");
        await options.completeTask(run.taskId);
      }
      await repo.updateRun(runId, {
        state: "completed",
        currentNodeId: null,
        completedAt: Date.now(),
      });
      return detail(runId, [`task=${run.taskId} confirmed; workflow completed`]);
    },

    cancel: async (runId) => {
      const run = await repo.getRunV2(runId);
      if (!run) throw new Error(`V2 Run 不存在：${runId}`);
      if (!["pending", "running", "paused", "awaiting-confirm"].includes(run.state)) {
        throw new Error(`Run 已结束（${run.state}），无法取消`);
      }
      await repo.updateRun(runId, {
        state: "cancelled",
        currentNodeId: null,
        completedAt: Date.now(),
      });
      return detail(runId, ["workflow cancelled"]);
    },
  };
}
