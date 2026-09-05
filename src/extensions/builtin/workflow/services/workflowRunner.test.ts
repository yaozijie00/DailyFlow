import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "../../../../db/test-helpers";
import type { Db } from "../../../../db/db";
import { WorkflowRepository } from "../repository/workflowRepository";
import { createWorkflowRunner } from "./workflowRunner";
import { newEdgeId, type Workflow, type WorkflowNode } from "../models";

function node(id: string, type: WorkflowNode["type"], title: string): WorkflowNode {
  return { id, type, title, position: { x: 0, y: 0 }, config: {} };
}

function chainWf(items: Array<{ id: string; type: WorkflowNode["type"]; title: string }>) {
  const nodes = items.map((i) => node(i.id, i.type, i.title));
  const edges = items.slice(0, -1).map((a, i) => ({
    id: newEdgeId(),
    source: a.id,
    target: items[i + 1].id,
  }));
  const wf: Workflow = {
    id: "x",
    name: "runner 测试",
    version: 1,
    nodes,
    edges,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
  return wf;
}

describe("WorkflowRunner（Start/Pause/Resume/Cancel/Complete + 持久化）", () => {
  let db: Db;
  let close: () => void;
  let repo: WorkflowRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    repo = new WorkflowRepository(db);
  });

  afterEach(() => close());

  it("start 到 checkpoint 暂停并持久化；resume 后 completed", async () => {
    const wf = await repo.create({
      name: "流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "app" },
        { id: "c", type: "checkpoint", title: "确认" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "app" },
        { id: "c", type: "checkpoint", title: "确认" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const launch = vi.fn(async () => undefined);
    const runner = createWorkflowRunner(repo, { launchApp: launch });

    const first = await runner.start(wf.id);
    expect(first.run.state).toBe("paused");
    expect(first.run.currentNodeId).toBe("c");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(first.events.some((e) => e.includes("checkpoint paused"))).toBe(true);
    expect((await repo.getRun(first.run.id))?.state).toBe("paused");

    const second = await runner.resume(first.run.id);
    expect(second.run.state).toBe("completed");
    expect(second.run.completedAt).not.toBeNull();
    expect((await repo.getRun(first.run.id))?.state).toBe("completed");
  });

  it("App 失败 → run failed 且错误持久化（nodeId+message）", async () => {
    const wf = await repo.create({
      name: "失败流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "blender" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "blender" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo, {
      launchApp: async () => {
        throw new Error("ExecutableNotFound: blender.exe");
      },
    });
    const res = await runner.start(wf.id);
    expect(res.run.state).toBe("failed");
    expect(res.run.error?.nodeId).toBe("a");
    expect(res.run.error?.message).toContain("ExecutableNotFound");
  });

  it("cancel：暂停态可取消", async () => {
    const wf = await repo.create({
      name: "取消流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "确认" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "确认" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const first = await runner.start(wf.id);
    expect(first.run.state).toBe("paused");
    const cancelled = await runner.cancel(first.run.id);
    expect(cancelled?.state).toBe("cancelled");
    expect(cancelled?.completedAt).not.toBeNull();
  });

  it("P8：关联任务的 run 到达 finish → awaiting-confirm，确认后才完成 Task 并 completed", async () => {
    const wf = await repo.create({
      name: "关联任务流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const completeTask = vi.fn(async (_taskId: number) => undefined);
    const runner = createWorkflowRunner(repo, { completeTask });

    const started = await runner.start(wf.id, 42);
    // 到达 finish 但不直接 completed：等待用户确认
    expect(started.run.state).toBe("awaiting-confirm");
    expect(completeTask).not.toHaveBeenCalled();
    expect((await repo.getRun(started.run.id))?.state).toBe("awaiting-confirm");

    // 未确认前 resume/cancel 语义：resume 不允许（非 paused），confirmFinish 才可完成
    await expect(runner.resume(started.run.id)).rejects.toThrow();

    const confirmed = await runner.confirmFinish(started.run.id);
    expect(completeTask).toHaveBeenCalledTimes(1);
    expect(completeTask).toHaveBeenCalledWith(42);
    expect(confirmed.run.state).toBe("completed");
    expect(confirmed.run.completedAt).not.toBeNull();
    expect((await repo.getRun(started.run.id))?.state).toBe("completed");
  });

  it("P8：confirmFinish 在 completeTask 抛错时保持 awaiting-confirm（可重试/取消）", async () => {
    const wf = await repo.create({
      name: "完成失败流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const completeTask = vi.fn(async (_taskId: number) => {
      throw new Error("任务不存在或已删除");
    });
    const runner = createWorkflowRunner(repo, { completeTask });

    const started = await runner.start(wf.id, 7);
    expect(started.run.state).toBe("awaiting-confirm");
    await expect(runner.confirmFinish(started.run.id)).rejects.toThrow("任务不存在");
    // 保持 awaiting-confirm，可取消
    expect((await repo.getRun(started.run.id))?.state).toBe("awaiting-confirm");
    const cancelled = await runner.cancel(started.run.id);
    expect(cancelled?.state).toBe("cancelled");
  });

  it("P8：未关联任务的 run 到 finish 直接 completed（不进入确认态）", async () => {
    const wf = await repo.create({
      name: "无任务流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const res = await runner.start(wf.id);
    expect(res.run.state).toBe("completed");
  });

  it("Phase4：cancel 终态 run（completed）被拒绝", async () => {
    const wf = await repo.create({
      name: "终态流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const res = await runner.start(wf.id);
    expect(res.run.state).toBe("completed");
    // completed 是终态：不允许 cancel 改写成 cancelled
    await expect(runner.cancel(res.run.id)).rejects.toThrow();
    expect((await repo.getRun(res.run.id))?.state).toBe("completed");
  });

  it("Phase4：repository 拒绝非法状态转换（completed → running）", async () => {
    const wf = await repo.create({
      name: "repo 状态机",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const res = await runner.start(wf.id);
    expect(res.run.state).toBe("completed");
    await expect(repo.updateRun(res.run.id, { state: "running" })).rejects.toThrow("非法状态转换");
  });

  it("Phase4：executor 同步抛错 → 转 failed（不穿透成 running 滞留）", async () => {
    const wf = await repo.create({
      name: "executor 抛错流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "a" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "a" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo, {
      launchApp: async () => {
        throw new Error("boom: 同步异常");
      },
    });
    const res = await runner.start(wf.id);
    expect(res.run.state).toBe("failed");
    expect(res.run.error?.nodeId).toBe("a");
    expect(res.run.error?.message).toContain("boom");
    expect((await repo.getRun(res.run.id))?.state).toBe("failed");
  });

  it("Phase4：resume 时暂停的 checkpoint 已被删除 → failed（不静默 completed）", async () => {
    const wf = await repo.create({
      name: "暂停后改图流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "c" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "c" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const first = await runner.start(wf.id);
    expect(first.run.state).toBe("paused");

    // 模拟暂停期间用户在编辑器删除 checkpoint 并保存
    const g2 = chainWf([
      { id: "g", type: "goal", title: "g" },
      { id: "f", type: "finish", title: "f" },
    ]);
    const updated = await repo.update(wf.id, { nodes: g2.nodes, edges: g2.edges });
    expect(updated).not.toBeNull();

    // resume：暂停点 c 已不存在 → failed，且错误含节点信息
    const resumed = await runner.resume(first.run.id);
    expect(resumed.run.state).toBe("failed");
    expect(resumed.run.error?.message).toContain("暂停节点已被删除");
    expect((await repo.getRun(first.run.id))?.state).toBe("failed");
  });

  it("Phase4：同一 Workflow 已有进行中 run 时禁止再次 start", async () => {
    const wf = await repo.create({
      name: "去重流程",
      nodes: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "c" },
        { id: "f", type: "finish", title: "f" },
      ]).nodes,
      edges: chainWf([
        { id: "g", type: "goal", title: "g" },
        { id: "c", type: "checkpoint", title: "c" },
        { id: "f", type: "finish", title: "f" },
      ]).edges,
    });
    const runner = createWorkflowRunner(repo);
    const first = await runner.start(wf.id);
    expect(first.run.state).toBe("paused");
    await expect(runner.start(wf.id)).rejects.toThrow("已有进行中的运行");
    // 取消后可以再次启动
    await runner.cancel(first.run.id);
    const second = await runner.start(wf.id);
    expect(second.run.state).toBe("paused");
  });
});
