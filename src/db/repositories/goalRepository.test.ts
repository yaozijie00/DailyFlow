import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { GoalRepository } from "./goalRepository";
import { TaskRepository } from "./taskRepository";

describe("GoalRepository", () => {
  let db: Db;
  let close: () => void;
  let goals: GoalRepository;
  let tasks: TaskRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    goals = new GoalRepository(db);
    tasks = new TaskRepository(db);
  });

  afterEach(() => close());

  it("create 默认 active 状态，description/deadline 可空", async () => {
    const g = await goals.create({ title: "三个月内完成 App 重构" });
    expect(g.title).toBe("三个月内完成 App 重构");
    expect(g.status).toBe("active");
    expect(g.description).toBeNull();
    expect(g.deadline).toBeNull();
    expect(g.completedAt).toBeNull();

    const full = await goals.create({
      title: "带说明的目标",
      description: "说明文字",
      deadline: "2026-12-31",
    });
    expect(full.description).toBe("说明文字");
    expect(full.deadline).toBe("2026-12-31");
  });

  it("listActive 只返回进行中，listCompleted 只返回已完成", async () => {
    const a = await goals.create({ title: "A" });
    const b = await goals.create({ title: "B" });
    await goals.complete(b.id);

    expect((await goals.listActive()).map((g) => g.id)).toEqual([a.id]);
    expect((await goals.listCompleted()).map((g) => g.id)).toEqual([b.id]);
  });

  it("update 修改标题/说明/截止日期", async () => {
    const g = await goals.create({ title: "A" });
    const updated = await goals.update(g.id, {
      title: "B",
      description: "新说明",
      deadline: "2026-12-31",
    });
    expect(updated?.title).toBe("B");
    expect(updated?.description).toBe("新说明");
    expect(updated?.deadline).toBe("2026-12-31");
  });

  it("complete 保留数据并标记完成时间，重复完成幂等", async () => {
    const g = await goals.create({ title: "A" });
    const done = await goals.complete(g.id);
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).not.toBeNull();
    expect(await goals.findById(g.id)).not.toBeNull();

    const again = await goals.complete(g.id);
    expect(again?.status).toBe("completed");
  });

  it("delete 物理删除", async () => {
    const g = await goals.create({ title: "A" });
    expect(await goals.delete(g.id)).toBe(true);
    expect(await goals.findById(g.id)).toBeNull();
    expect(await goals.delete(g.id)).toBe(false);
  });

  it("进度：只统计关联任务，已取消不计入总数", async () => {
    const g = await goals.create({ title: "目标" });
    const other = await goals.create({ title: "其他目标" });

    const t1 = await tasks.create({ title: "完成", scheduledDate: "2026-08-27", goalId: g.id });
    await tasks.update(t1.id, { status: "COMPLETED", completedAt: Date.now() });
    await tasks.create({ title: "待办", scheduledDate: "2026-08-27", goalId: g.id });
    // 已取消：不计入总数
    await tasks.create({
      title: "取消",
      scheduledDate: "2026-08-27",
      goalId: g.id,
      status: "CANCELLED",
    });
    // 未关联本目标：不计入
    await tasks.create({ title: "无关", scheduledDate: "2026-08-27", goalId: other.id });

    const withProgress = await goals.listActiveWithProgress();
    const mine = withProgress.find((x) => x.id === g.id)!;
    expect(mine.totalTasks).toBe(2);
    expect(mine.completedTasks).toBe(1);
  });

  it("无关联任务时进度为 0/0", async () => {
    await goals.create({ title: "空目标" });
    const withProgress = await goals.listActiveWithProgress();
    expect(withProgress[0].totalTasks).toBe(0);
    expect(withProgress[0].completedTasks).toBe(0);
  });

  it("删除目标后关联任务保留，goal_id 置空（FK SET NULL）", async () => {
    const g = await goals.create({ title: "目标" });
    const t = await tasks.create({ title: "任务", scheduledDate: "2026-08-27", goalId: g.id });
    expect(t.goalId).toBe(g.id);

    await goals.delete(g.id);
    const kept = await tasks.findById(t.id);
    expect(kept).not.toBeNull();
    expect(kept?.goalId).toBeNull();
  });
});
