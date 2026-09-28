import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { GoalRepository, goalProgressPercent } from "./goalRepository";
import { TaskRepository } from "./taskRepository";
import { FocusSessionRepository } from "./focusSessionRepository";

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

  it("投入统计保留发生时的目标归属", async () => {
    const a = await goals.create({ title: "原计划" });
    const b = await goals.create({ title: "新计划" });
    const task = await tasks.create({ title: "练习", scheduledDate: "2026-09-16", goalId: a.id });
    await new FocusSessionRepository(db).create({ taskId: task.id, startedAt: Date.now(), plannedDuration: 1800, actualDuration: 1800 });
    await tasks.update(task.id, { goalId: b.id });
    let rows = await goals.findAllWithProgress();
    expect(rows.find((row) => row.id === a.id)?.focusSeconds).toBe(1800);
    expect(rows.find((row) => row.id === b.id)?.focusSeconds).toBe(0);
    await tasks.delete(task.id);
    rows = await goals.findAllWithProgress();
    expect(rows.find((row) => row.id === a.id)?.focusSeconds).toBe(1800);
  });

  it("尚有未估时任务时覆盖率不能四舍五入到 100%", async () => {
    const g = await goals.create({ title: "覆盖率" });
    for (let i = 0; i < 201; i++) await tasks.create({ title: `任务 ${i}`, scheduledDate: "", goalId: g.id, estimatedDuration: i < 200 ? 60 : null });
    expect((await goals.findAllWithProgress())[0].estimateCoverage).toBe(99);
  });

  it("未完成任务不能因四舍五入显示 100%", () => {
    expect(goalProgressPercent(null, 201, 200)).toBe(99);
  });

  it("估时不完整时暴露覆盖率，未估时任务不能被忽略为全部完成", async () => {
    const g = await goals.create({ title: "部分估时" });
    await tasks.create({ title: "完成", scheduledDate: "2026-09-16", goalId: g.id, status: "COMPLETED", estimatedDuration: 7200 });
    await tasks.create({ title: "未知工作", scheduledDate: "2026-09-16", goalId: g.id });
    const plan = (await goals.listActiveWithProgress())[0];
    expect(plan.progressPercent).toBe(50);
    expect(plan.progressKnown).toBe(false);
    expect(plan.estimateCoverage).toBe(50);
    expect(plan.progressConfidence).toBe("partial");
  });

  it("父任务有子任务时只按叶任务汇总，避免重复计算工作量", async () => {
    const g = await goals.create({ title: "拆分工作" });
    const parent = await tasks.create({ title: "总任务", scheduledDate: "2026-09-16", goalId: g.id, estimatedDuration: 7200 });
    await tasks.create({ title: "子任务 A", scheduledDate: "2026-09-16", goalId: g.id, parentId: parent.id, status: "COMPLETED", estimatedDuration: 3600 });
    await tasks.create({ title: "子任务 B", scheduledDate: "2026-09-16", goalId: g.id, parentId: parent.id, estimatedDuration: 3600 });
    const plan = (await goals.listActiveWithProgress())[0];
    expect(plan.totalTasks).toBe(2);
    expect(plan.completedTasks).toBe(1);
    expect(plan.progressPercent).toBe(50);
    expect(plan.remainingEstimatedMinutes).toBe(60);
    expect(plan.progressKnown).toBe(true);
    expect(plan.estimateCoverage).toBe(100);
  });

  it("空计划进度未知，手动和任务计数模式各自保留可信来源", async () => {
    await goals.create({ title: "空计划" });
    await goals.create({ title: "手动", manualProgress: 25 });
    const counted = await goals.create({ title: "任务计数", progressMode: "tasks" });
    await tasks.create({ title: "任务", scheduledDate: "2026-09-16", goalId: counted.id });
    const plans = await goals.listActiveWithProgress();
    expect(plans[0].progressKnown).toBe(false);
    expect(plans[0].progressConfidence).toBe("unknown");
    expect(plans[1].progressKnown).toBe(true);
    expect(plans[1].progressConfidence).toBe("manual");
    expect(plans[2].progressKnown).toBe(true);
  });

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
      startDate: "2026-09-01",
      priority: "high",
      manualProgress: 40,
    });
    expect(full.description).toBe("说明文字");
    expect(full.deadline).toBe("2026-12-31");
    expect(full.startDate).toBe("2026-09-01");
    expect(full.priority).toBe("high");
    expect(full.manualProgress).toBe(40);
  });

  it("默认 priority=medium、manualProgress=null（自动进度）", async () => {
    const g = await goals.create({ title: "默认目标" });
    expect(g.priority).toBe("medium");
    expect(g.manualProgress).toBeNull();
  });

  it("进度：手动进度优先于任务完成率", async () => {
    const g = await goals.create({ title: "手动", manualProgress: 25 });
    const t = await tasks.create({ title: "A", scheduledDate: "2026-08-27", goalId: g.id });
    await tasks.update(t.id, { status: "COMPLETED", completedAt: Date.now() });
    const wp = await goals.listActiveWithProgress();
    expect(wp[0].progressPercent).toBe(25);
  });

  it("切换到任务数模式后不再沿用残留的手动进度", async () => {
    const g = await goals.create({ title: "切换模式", manualProgress: 25 });
    const completed = await tasks.create({ title: "A", scheduledDate: "2026-08-27", goalId: g.id });
    await tasks.update(completed.id, { status: "COMPLETED", completedAt: Date.now() });
    await tasks.create({ title: "B", scheduledDate: "2026-08-27", goalId: g.id });
    await goals.update(g.id, { progressMode: "tasks" });

    const plan = (await goals.listActiveWithProgress()).find((item) => item.id === g.id);
    expect(plan?.manualProgress).toBe(25);
    expect(plan?.progressPercent).toBe(50);
  });

  it("进度：无手动进度时按任务完成率计算", async () => {
    const g = await goals.create({ title: "自动" });
    const t1 = await tasks.create({ title: "A", scheduledDate: "2026-08-27", goalId: g.id });
    await tasks.update(t1.id, { status: "COMPLETED", completedAt: Date.now() });
    await tasks.create({ title: "B", scheduledDate: "2026-08-27", goalId: g.id });
    const wp = await goals.listActiveWithProgress();
    expect(wp[0].progressPercent).toBe(50);
  });

  it("update 修改开始日期/优先级/手动进度", async () => {
    const g = await goals.create({ title: "A" });
    const updated = await goals.update(g.id, {
      startDate: "2026-09-05",
      priority: "low",
      manualProgress: 80,
    });
    expect(updated?.startDate).toBe("2026-09-05");
    expect(updated?.priority).toBe("low");
    expect(updated?.manualProgress).toBe(80);
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
