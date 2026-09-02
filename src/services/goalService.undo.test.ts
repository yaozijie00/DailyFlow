import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { GoalRepository } from "../db/repositories/goalRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { GoalService } from "./goalService";
import { undoManager } from "../lib/undoManager";

describe("GoalService Undo 集成（长期目标全操作可撤销，数据与 SQLite 一致）", () => {
  let db: Db;
  let close: () => void;
  let goals: GoalRepository;
  let tasks: TaskRepository;
  let svc: GoalService;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    goals = new GoalRepository(db);
    tasks = new TaskRepository(db);
    svc = new GoalService(goals);
    undoManager.clear();
  });

  afterEach(() => close());

  it("创建 → 撤销删除 → 重做还原（显式 id 数据一致）", async () => {
    const g = await svc.create({ title: "Unity开发", startDate: "2026-09-03", deadline: "2026-09-18" });
    expect((await goals.findById(g.id))?.title).toBe("Unity开发");

    await undoManager.undo();
    expect(await goals.findById(g.id)).toBeNull();

    await undoManager.redo();
    const back = await goals.findById(g.id);
    expect(back).not.toBeNull();
    expect(back?.title).toBe("Unity开发");
    expect(back?.startDate).toBe("2026-09-03");
    expect(back?.deadline).toBe("2026-09-18");
  });

  it("编辑字段（标题/优先级/日期）→ 撤销 → 重做", async () => {
    const g = await svc.create({ title: "目标", startDate: "2026-09-03", deadline: "2026-09-18" });
    await svc.update(g.id, { title: "改名", priority: "high", startDate: "2026-09-05" });

    await undoManager.undo();
    const r1 = await goals.findById(g.id);
    expect(r1?.title).toBe("目标");
    expect(r1?.priority).toBe("medium");
    expect(r1?.startDate).toBe("2026-09-03");

    await undoManager.redo();
    const r2 = await goals.findById(g.id);
    expect(r2?.title).toBe("改名");
    expect(r2?.priority).toBe("high");
    expect(r2?.startDate).toBe("2026-09-05");
  });

  it("月历拖动范围（一次 update）= 一次 Undo，恢复原日期", async () => {
    const g = await svc.create({ title: "拖动", startDate: "2026-09-03", deadline: "2026-09-18" });
    await svc.update(g.id, { startDate: "2026-09-05", deadline: "2026-09-20" });
    expect((await goals.findById(g.id))?.startDate).toBe("2026-09-05");

    await undoManager.undo();
    const r = await goals.findById(g.id);
    expect(r?.startDate).toBe("2026-09-03");
    expect(r?.deadline).toBe("2026-09-18");

    await undoManager.redo();
    expect((await goals.findById(g.id))?.deadline).toBe("2026-09-20");
  });

  it("完成 → 撤销回 active（completedAt 清空）→ 重做再完成", async () => {
    const g = await svc.create({ title: "阶段" });
    await svc.complete(g.id);
    expect((await goals.findById(g.id))?.status).toBe("completed");

    await undoManager.undo();
    const r = await goals.findById(g.id);
    expect(r?.status).toBe("active");
    expect(r?.completedAt).toBeNull();

    await undoManager.redo();
    expect((await goals.findById(g.id))?.status).toBe("completed");
  });

  it("删除目标：任务 goal_id 置空；撤销 = 还原目标行 + 恢复任务关联", async () => {
    const g = await svc.create({ title: "要删的目标", startDate: "2026-09-01", deadline: "2026-09-30" });
    const t = await tasks.create({ title: "关联任务", scheduledDate: "2026-09-01", goalId: g.id });
    expect(t.goalId).toBe(g.id);

    await svc.delete(g.id);
    expect(await goals.findById(g.id)).toBeNull();
    expect((await tasks.findById(t.id))?.goalId).toBeNull();

    await undoManager.undo();
    const restored = await goals.findById(g.id);
    expect(restored?.title).toBe("要删的目标");
    expect((await tasks.findById(t.id))?.goalId).toBe(g.id);

    await undoManager.redo();
    expect(await goals.findById(g.id)).toBeNull();
    expect((await tasks.findById(t.id))?.goalId).toBeNull();
  });

  it("删除后再执行新操作：redo 栈清空", async () => {
    const g = await svc.create({ title: "A" });
    await svc.delete(g.id);
    await undoManager.undo();
    expect(undoManager.canRedo()).toBe(true);

    await svc.update(g.id, { title: "改名" });
    expect(undoManager.canRedo()).toBe(false);
    expect(undoManager.canUndo()).toBe(true);
  });

  it("redo 前 undo 失败保护：还原动作失败时动作回栈（模拟不存在的场景不抛错路径）", async () => {
    // undoManager.undo 在无可撤销动作时返回 false，栈不变
    expect(await undoManager.undo()).toBe(false);
    expect(undoManager.canUndo()).toBe(false);
  });
});
