import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../../db/db";
import { createTestDb } from "../../../../db/test-helpers";
import { WorkflowNodeRegistry } from "../domain/nodeRegistry";
import type { WorkflowNodeDefinition } from "../domain/nodeDefinition";
import type { WorkflowV2 } from "../domain/types";
import { CORE_NODE_DEFINITIONS } from "../nodes/coreNodes";
import { WorkflowRepository } from "../repository/workflowRepository";
import { createWorkflowRunnerV2 } from "./workflowRunnerV2";

function workflow(nodes: WorkflowV2["nodes"]): WorkflowV2 {
  return {
    id: "wf_runner_v2",
    schemaVersion: 2,
    name: "V2 runner",
    version: 4,
    variables: [{ key: "name", label: "名称", type: "text", required: true }],
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      id: `edge-${index}`,
      source: node.id,
      target: nodes[index + 1].id,
    })),
    tags: [],
    createdAt: 100,
    updatedAt: 200,
  };
}

const start = {
  id: "start",
  type: "core.start",
  typeVersion: 1,
  title: "开始",
  position: { x: 0, y: 0 },
  config: {},
};
const finish = {
  id: "finish",
  type: "core.finish",
  typeVersion: 1,
  title: "完成",
  position: { x: 400, y: 0 },
  config: {},
};

function registryWith(definitions: WorkflowNodeDefinition[] = []): WorkflowNodeRegistry {
  const registry = new WorkflowNodeRegistry();
  [...CORE_NODE_DEFINITIONS, ...definitions].forEach((definition) => registry.register(definition));
  return registry;
}

function actionDefinition(
  execute: WorkflowNodeDefinition["execute"],
): WorkflowNodeDefinition {
  return {
    type: "test.action",
    version: 1,
    category: "test",
    title: "测试动作",
    capabilities: [],
    ports: [
      { id: "in", direction: "input", maxConnections: 1 },
      { id: "out", direction: "output", maxConnections: 1 },
    ],
    configSchema: { fields: [] },
    idempotent: true,
    validate: () => [],
    preview: async () => [],
    execute,
  };
}

describe("WorkflowRunner V2", () => {
  let db: Db;
  let close: () => void;
  let repo: WorkflowRepository;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    repo = new WorkflowRepository(db);
  });

  afterEach(() => close());

  it("plans, freezes inputs and records every completed node", async () => {
    const execute = vi.fn(async () => ({ status: "completed" as const, output: { ok: true } }));
    const source = workflow([
      start,
      {
        id: "action",
        type: "test.action",
        typeVersion: 1,
        title: "创建内容",
        position: { x: 200, y: 0 },
        config: { value: "{{ name }}" },
      },
      finish,
    ]);
    await repo.saveMigratedWorkflow(source);
    const runner = createWorkflowRunnerV2(repo, registryWith([actionDefinition(execute)]));

    const plan = await runner.plan(source.id, { name: "DailyFlow" });
    expect(plan.executable).toBe(true);
    const result = await runner.start({ workflowId: source.id, variables: { name: "DailyFlow" } });

    expect(result.run.state).toBe("completed");
    expect(result.run.workflowVersion).toBe(4);
    expect(result.run.variablesSnapshot).toEqual({ name: "DailyFlow" });
    expect(result.steps.map((step) => step.state)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(result.steps[1].output).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(
      { value: "DailyFlow" },
      expect.objectContaining({ variables: { name: "DailyFlow" } }),
    );
  });

  it("resumes from the frozen snapshot after the editable workflow changes", async () => {
    const source = workflow([
      start,
      {
        id: "checkpoint",
        type: "core.checkpoint",
        typeVersion: 1,
        title: "检查",
        position: { x: 200, y: 0 },
        config: {},
      },
      finish,
    ]);
    await repo.saveMigratedWorkflow(source);
    const runner = createWorkflowRunnerV2(repo, registryWith());
    const paused = await runner.start({ workflowId: source.id, variables: { name: "A" } });
    expect(paused.run.state).toBe("paused");

    await repo.saveMigratedWorkflow({ ...source, version: 5, nodes: [start, finish], edges: [
      { id: "new-edge", source: "start", target: "finish" },
    ] });
    const resumed = await runner.resume(paused.run.id);

    expect(resumed.run.state).toBe("completed");
    expect(resumed.run.workflowVersion).toBe(4);
    expect(resumed.steps.map((step) => step.nodeId)).toEqual(["start", "checkpoint", "finish"]);
  });

  it("retries only the failed step and keeps completed step logs", async () => {
    let attempts = 0;
    const execute = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return { status: "completed" as const };
    });
    const source = workflow([
      start,
      {
        id: "action",
        type: "test.action",
        typeVersion: 1,
        title: "可能失败",
        position: { x: 200, y: 0 },
        config: {},
      },
      finish,
    ]);
    await repo.saveMigratedWorkflow(source);
    const runner = createWorkflowRunnerV2(repo, registryWith([actionDefinition(execute)]));
    const failed = await runner.start({ workflowId: source.id, variables: { name: "A" } });
    expect(failed.run.state).toBe("failed");
    expect(failed.steps[0].state).toBe("completed");
    expect(failed.steps[1].error).toMatchObject({ retryable: true });

    const retried = await runner.retry(failed.run.id);
    expect(retried.run.state).toBe("completed");
    expect(retried.steps.map((step) => step.state)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(retried.steps[0].startedAt).toBe(failed.steps[0].startedAt);
  });

  it("rejects retry when a node reports a non-retryable failure", async () => {
    const source = workflow([
      start,
      {
        id: "action",
        type: "test.action",
        typeVersion: 1,
        title: "永久失败",
        position: { x: 200, y: 0 },
        config: {},
      },
      finish,
    ]);
    await repo.saveMigratedWorkflow(source);
    const definition = actionDefinition(async () => ({
      status: "failed",
      message: "invalid config",
      retryable: false,
    }));
    const runner = createWorkflowRunnerV2(repo, registryWith([definition]));
    const failed = await runner.start({ workflowId: source.id, variables: { name: "A" } });

    await expect(runner.retry(failed.run.id)).rejects.toThrow("不可重试");
  });

  it("requires explicit confirmation before completing an associated task", async () => {
    const source = workflow([start, finish]);
    await repo.saveMigratedWorkflow(source);
    const completeTask = vi.fn(async () => undefined);
    const runner = createWorkflowRunnerV2(repo, registryWith(), { completeTask });

    const waiting = await runner.start({
      workflowId: source.id,
      variables: { name: "A" },
      taskId: 42,
    });
    expect(waiting.run.state).toBe("awaiting-confirm");
    expect(completeTask).not.toHaveBeenCalled();

    const completed = await runner.confirmFinish(waiting.run.id);
    expect(completed.run.state).toBe("completed");
    expect(completeTask).toHaveBeenCalledWith(42);
  });
});
