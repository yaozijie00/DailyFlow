import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../../../db/test-helpers";
import type { Db } from "../../../../db/db";
import { WorkflowRepository } from "./workflowRepository";
import { newNodeId, newEdgeId } from "../models";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("WorkflowRepository（扩展专属表 · 迁移 0021）", () => {
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

  function sampleNodes() {
    const a = newNodeId();
    const b = newNodeId();
    const nodes = [
      {
        id: a,
        type: "goal" as const,
        title: "制作石材材质",
        position: { x: 10, y: 20 },
        config: {},
      },
      {
        id: b,
        type: "finish" as const,
        title: "完成",
        position: { x: 300, y: 20 },
        config: {},
      },
    ];
    const edges = [{ id: newEdgeId(), source: a, target: b }];
    return { nodes, edges };
  }

  it("create → get：节点/边/配置 JSON 往返", async () => {
    const { nodes, edges } = sampleNodes();
    const wf = await repo.create({
      name: "石材流程",
      description: "PBR 流程",
      tags: ["Substance", "石材"],
      nodes,
      edges,
    });
    expect(wf.version).toBe(1);
    const loaded = await repo.get(wf.id);
    expect(loaded?.name).toBe("石材流程");
    expect(loaded?.nodes).toHaveLength(2);
    expect(loaded?.edges[0].source).toBe(nodes[0].id);
    expect(loaded?.nodes[0].config).toEqual({});
  });

  it("update：替换节点/边并 version+1", async () => {
    const s = sampleNodes(); // 同一组节点/边（边引用节点必须一致）
    const wf = await repo.create({ name: "流程A", nodes: s.nodes, edges: s.edges });
    const n2 = newNodeId();
    const updated = await repo.update(wf.id, {
      name: "流程A·改",
      nodes: [
        { id: n2, type: "checkpoint", title: "Height 完成？", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    });
    expect(updated?.version).toBe(2);
    expect(updated?.name).toBe("流程A·改");
    const loaded = await repo.get(wf.id);
    expect(loaded?.nodes.map((n) => n.title)).toEqual(["Height 完成？"]);
  });

  it("duplicate：新 id、边引用随节点重映射、名称加（副本）", async () => {
    const s = sampleNodes();
    const wf = await repo.create({ name: "UV 流程", nodes: s.nodes, edges: s.edges });
    const copy = await repo.duplicate(wf.id);
    expect(copy?.id).not.toBe(wf.id);
    expect(copy?.name).toContain("（副本）");
    // 节点全新、边指向副本内的新节点（按引用反查标题验证重映射）
    const loaded = await repo.get(copy!.id);
    const edgeTarget = loaded?.edges[0].source;
    const targetNode = loaded?.nodes.find((n) => n.id === edgeTarget);
    expect(loaded?.nodes.every((n) => !wf.nodes.some((o) => o.id === n.id))).toBe(true);
    expect(targetNode?.title).toBe("制作石材材质");
    expect(loaded?.edges[0].target).not.toBe(loaded?.edges[0].source);
  });

  it("delete：级联清理 runs/edges/nodes", async () => {
    const wf = await repo.create({ name: "待删" });
    const run = await repo.createRun(wf.id);
    expect(await repo.delete(wf.id)).toBe(true);
    expect(await repo.get(wf.id)).toBeNull();
    expect(await repo.getRun(run.id)).toBeNull();
  });

  it("list / findByName", async () => {
    await repo.create({ name: "A 流程" });
    await repo.create({ name: "B 流程" });
    const list = await repo.list();
    expect(list.map((w) => w.name).sort()).toEqual(["A 流程", "B 流程"]);
    expect((await repo.findByName("A 流程"))?.name).toBe("A 流程");
  });

  it("runs：create/update 状态机与列表", async () => {
    const wf = await repo.create({ name: "运行测试" });
    const run = await repo.createRun(wf.id, 7);
    expect(run.state).toBe("pending");
    const started = await repo.updateRun(run.id, {
      state: "running",
      currentNodeId: "n1",
      startedAt: 1000,
    });
    expect(started?.state).toBe("running");
    const finished = await repo.updateRun(run.id, {
      state: "completed",
      completedAt: 2000,
    });
    expect(finished?.state).toBe("completed");
    const runs = await repo.listRunsForWorkflow(wf.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].taskId).toBe(7);
  });

  it("V2 runs：跨模板筛选分页，进行中优先且模板删除后快照仍可读取", async () => {
    const makeWorkflow = async (name: string) => {
      const now = Date.now();
      const id = `wf-${name}`;
      await repo.saveMigratedWorkflow({
        id,
        schemaVersion: 2,
        name,
        version: 1,
        variables: [],
        nodes: [],
        edges: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      return (await repo.getV2(id))!;
    };
    const completedWorkflow = await makeWorkflow("已完成模板");
    const activeWorkflow = await makeWorkflow("进行中模板");
    const completed = await repo.createRunWithSnapshot(completedWorkflow, {});
    await repo.updateRun(completed.id, { state: "running", startedAt: 1 });
    await repo.updateRun(completed.id, { state: "completed", completedAt: 2 });
    const active = await repo.createRunWithSnapshot(activeWorkflow, {});
    await repo.updateRun(active.id, { state: "running", startedAt: 3 });

    const first = await repo.listRuns({ limit: 1 });
    expect(first.items.map((run) => run.id)).toEqual([active.id]);
    expect(first.nextCursor).toBe(active.id);
    const second = await repo.listRuns({ cursor: first.nextCursor!, limit: 1 });
    expect(second.items.map((run) => run.id)).toEqual([completed.id]);
    expect((await repo.listRuns({ states: ["completed"] })).items).toHaveLength(1);

    expect(await repo.delete(completedWorkflow.id)).toBe(true);
    expect(await repo.getV2(completedWorkflow.id)).toBeNull();
    expect((await repo.listRuns({ states: ["completed"] })).items[0].workflowSnapshot.name).toBe("已完成模板");
  });

  it("A5：countCompletedRuns 只统计 completed 的 run（跨全部 Workflow）", async () => {
    const wf = await repo.create({ name: "A" });
    const wf2 = await repo.create({ name: "B" });
    const r1 = await repo.createRun(wf.id);
    const r2 = await repo.createRun(wf.id);
    const r3 = await repo.createRun(wf2.id);
    expect(await repo.countCompletedRuns()).toBe(0);
    await repo.updateRun(r1.id, { state: "running", startedAt: 1 });
    await repo.updateRun(r1.id, { state: "completed", completedAt: 1 });
    await repo.updateRun(r2.id, { state: "running", startedAt: 2 });
    await repo.updateRun(r2.id, { state: "cancelled", completedAt: 2 });
    await repo.updateRun(r3.id, { state: "running", startedAt: 3 });
    await repo.updateRun(r3.id, { state: "completed", completedAt: 3 });
    expect(await repo.countCompletedRuns()).toBe(2);
  });

  it("Phase2：禁止部分替换（只传 nodes 或只传 edges → 拒绝，旧图保留）", async () => {
    const s = sampleNodes();
    const wf = await repo.create({ name: "流程", nodes: s.nodes, edges: s.edges });
    // 只传 edges（不传 nodes）→ 应抛错
    await expect(
      repo.update(wf.id, { edges: [{ id: newEdgeId(), source: s.nodes[0].id, target: s.nodes[1].id }] }),
    ).rejects.toThrow("必须同时提供");
    // 旧图未被破坏
    const loaded = await repo.get(wf.id);
    expect(loaded?.nodes).toHaveLength(2);
    expect(loaded?.edges).toHaveLength(1);
  });

  it("Phase2：结构预检拒绝重复节点 id / 悬空边 / 自连（不落库）", async () => {
    const s = sampleNodes();
    // 重复 id：第二个节点复用第一个的 id
    await expect(
      repo.create({
        name: "重复",
        nodes: [s.nodes[0], { ...s.nodes[0], title: "重复" }],
        edges: [],
      }),
    ).rejects.toThrow("重复节点 id");
    // 悬空边：target 不存在
    await expect(
      repo.create({
        name: "悬空",
        nodes: s.nodes,
        edges: [{ id: newEdgeId(), source: s.nodes[0].id, target: "ghost" }],
      }),
    ).rejects.toThrow("悬空连线");
    // 自连
    await expect(
      repo.create({
        name: "自连",
        nodes: s.nodes,
        edges: [{ id: newEdgeId(), source: s.nodes[0].id, target: s.nodes[0].id }],
      }),
    ).rejects.toThrow("自连接");
    // 均未落库
    const list = await repo.list();
    expect(list.map((w) => w.name)).not.toContain("重复");
    expect(list.map((w) => w.name)).not.toContain("悬空");
    expect(list.map((w) => w.name)).not.toContain("自连");
  });

  it("Phase2：重启保留 —— 文件库关闭后重开，Workflow/图/Run 完整恢复", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-persist-"));
    const file = path.join(dir, "dailyflow-test.db");
    try {
      const first = await createTestDb(file);
      const repo1 = new WorkflowRepository(first.db);
      const s = sampleNodes();
      const wf = await repo1.create({ name: "持久流程", tags: ["重启"], nodes: s.nodes, edges: s.edges });
      const run = await repo1.createRun(wf.id, 9);
      await repo1.updateRun(run.id, { state: "running", startedAt: 1000 });
      first.close(); // 模拟应用关闭

      // 重新打开同一文件（模拟重启；迁移幂等跳过已应用项）
      const second = await createTestDb(file);
      try {
        const repo2 = new WorkflowRepository(second.db);
        const loaded = await repo2.get(wf.id);
        expect(loaded?.name).toBe("持久流程");
        expect(loaded?.tags).toEqual(["重启"]);
        expect(loaded?.nodes).toHaveLength(2);
        expect(loaded?.edges).toHaveLength(1);
        expect(loaded?.nodes[0].title).toBe("制作石材材质");
        const run2 = await repo2.getRun(run.id);
        expect(run2?.state).toBe("running");
        expect(run2?.taskId).toBe(9);
      } finally {
        second.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
