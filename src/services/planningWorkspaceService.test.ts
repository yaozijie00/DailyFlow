import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-helpers";
import { TaskRepository } from "../db/repositories/taskRepository";
import { GoalRepository } from "../db/repositories/goalRepository";
import { PlanningWorkspaceService } from "./planningWorkspaceService";
import { UndoManager } from "../lib/undoManager";

describe("长期工作台闭环", () => {
  let data: Awaited<ReturnType<typeof createTestDb>>;
  let service: PlanningWorkspaceService;
  beforeEach(async () => { data = await createTestDb(); service = new PlanningWorkspaceService(data.db, new UndoManager()); });
  afterEach(() => data.close());
  it("撤销下一步绑定恢复原有文字行动", async () => {
    const history = new UndoManager(), workspace = new PlanningWorkspaceService(data.db, history);
    const goal = await new GoalRepository(data.db).create({ title: "计划", nextAction: "未拆分的动作" });
    const task = await new TaskRepository(data.db).create({ title: "已有任务", goalId: goal.id, scheduledDate: "" });
    await workspace.update(`plan:${goal.id}`, { nextTaskId: task.id });
    await history.undo();
    expect((await workspace.list("2026-09-14"))[0].nextAction).toBe("未拆分的动作");
    await history.redo();
    expect((await workspace.list("2026-09-14"))[0].nextTask?.id).toBe(task.id);
  });
  it("创建、改名、添加下一步均可撤销和重做，保持同一对象 ID", async () => {
    const history = new UndoManager();
    const workspace = new PlanningWorkspaceService(data.db, history);
    const key = await workspace.create("project", "项目", true);
    await workspace.rename(key, "新名称");
    await history.undo();
    expect((await workspace.list("2026-09-14"))[0].title).toBe("项目");
    await history.redo();
    const task = await workspace.addTask(key, "下一步");
    await history.undo();
    expect(await new TaskRepository(data.db).findById(task.id)).toBeNull();
    await history.redo();
    expect((await workspace.list("2026-09-14"))[0].nextTask?.id).toBe(task.id);
    await history.undo(); await history.undo(); await history.undo();
    expect(await workspace.list("2026-09-14")).toHaveLength(0);
    await history.redo();
    expect((await workspace.list("2026-09-14"))[0]).toMatchObject({ key, lifecycle: "idea" });
  });
  it("显示的下一步与加入 Today 的任务一致，重复加入不复制", async () => {
    const goal = await new GoalRepository(data.db).create({ title: "UE", nextAction: "指定练习" });
    const tasks = new TaskRepository(data.db);
    await tasks.create({ title: "更早但未指定", scheduledDate: "2026-09-01", goalId: goal.id });
    const chosen = await tasks.create({ title: "指定练习", scheduledDate: "", goalId: goal.id });
    const key = `plan:${goal.id}`;
    expect((await service.list("2026-09-14")).find((item) => item.key === key)?.nextTask?.id).toBe(chosen.id);
    expect((await service.scheduleNext(key, "2026-09-16")).task.id).toBe(chosen.id);
    await service.scheduleNext(key, "2026-09-16");
    expect((await tasks.findAll()).length).toBe(2);
    expect((await tasks.findById(chosen.id))?.scheduledDate).toBe("2026-09-16");
  });
  it("只有文字下一步时并发安排也只创建一个任务", async () => {
    const goal = await new GoalRepository(data.db).create({ title: "UE", nextAction: "练习" });
    const key = `plan:${goal.id}`;
    const [a, b] = await Promise.all([service.scheduleNext(key, "2026-09-16"), service.scheduleNext(key, "2026-09-16")]);
    expect(a.task.id).toBe(b.task.id);
    expect(await new TaskRepository(data.db).findAll()).toHaveLength(1);
  });
  it("完成已绑定下一步后不重新创建相同文字，指定显示任务优先且拒绝已完成任务", async () => {
    const goal = await new GoalRepository(data.db).create({ title: "UE", nextAction: "练习" });
    const key = `plan:${goal.id}`, tasks = new TaskRepository(data.db);
    const first = await service.scheduleNext(key, "2026-09-16");
    await tasks.update(first.task.id, { status: "COMPLETED" });
    expect((await service.list("2026-09-14")).find((item) => item.key === key)?.nextAction).toBeNull();
    await expect(service.scheduleNext(key, "2026-09-17", first.task.id)).rejects.toThrow();
    const next = await tasks.create({ title: "下一练习", goalId: goal.id, scheduledDate: "" });
    expect((await service.scheduleNext(key, "2026-09-17", next.id)).task.id).toBe(next.id);
  });
  it("创建想法不预填周承诺，完成与归档后仍可读取详情", async () => {
    const key = await service.create("project", "YuJie", true);
    let item = (await service.list("2026-09-14")).find((row) => row.key === key)!;
    expect(item.lifecycle).toBe("idea");
    expect(item.week).toBeNull();
    await service.update(key, { lifecycle: "completed", archivedAt: 123 });
    item = (await service.list("2026-09-14")).find((row) => row.key === key)!;
    expect(item.lifecycle).toBe("completed");
    expect(item.archivedAt).toBe(123);
  });
});
