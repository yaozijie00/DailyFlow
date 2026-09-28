import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { createTestDb } from "../test-helpers";
import { GoalRepository } from "./goalRepository";
import { LongTermPlanRepository } from "./longTermPlanRepository";
import { TaskRepository } from "./taskRepository";

describe("LongTermPlanRepository", () => {
  let db: Db;
  let close: () => void;
  let goals: GoalRepository;
  let plans: LongTermPlanRepository;
  let tasks: TaskRepository;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    close = testDb.close;
    goals = new GoalRepository(db);
    plans = new LongTermPlanRepository(db);
    tasks = new TaskRepository(db);
  });

  afterEach(() => close());

  it("创建阶段并按顺序返回，任务可关联阶段", async () => {
    const goal = await goals.create({ title: "UE 学习", weeklyTargetMinutes: 360 });
    const blueprint = await plans.createPhase(goal.id, { title: "Blueprint", estimatedMinutes: 600 });
    await plans.createPhase(goal.id, { title: "Material", estimatedMinutes: 300 });
    const task = await tasks.create({
      title: "Blueprint Communication",
      scheduledDate: "2026-09-10",
      goalId: goal.id,
      phaseId: blueprint.id,
      estimatedDuration: 120 * 60,
    });

    expect((await plans.listPhases(goal.id)).map((phase) => phase.title)).toEqual(["Blueprint", "Material"]);
    expect((await plans.listTasks(goal.id))[0]).toMatchObject({ id: task.id, phaseId: blueprint.id });
  });

  it("只保存关键计划变更记录", async () => {
    const goal = await goals.create({ title: "作品集" });
    await plans.addHistory(goal.id, "weekly_target", "每周投入", "360", "240");
    expect((await plans.listHistory(goal.id)).find((entry) => entry.field === "weekly_target")).toEqual(
      expect.objectContaining({ oldValue: "360", newValue: "240" }),
    );
  });

  it("创建长期计划时留下初始计划记录", async () => {
    const goal = await goals.create({ title: "DailyFlow", weeklyTargetMinutes: 600, deadline: "2026-12-31" });
    expect(await plans.listHistory(goal.id)).toEqual([
      expect.objectContaining({ field: "created", label: "创建长期计划", newValue: "10h/week · 目标 2026-12-31" }),
    ]);
  });

  it("删除阶段时保留任务并清空 phaseId", async () => {
    const goal = await goals.create({ title: "UE 学习" });
    const phase = await plans.createPhase(goal.id, { title: "Blueprint" });
    await goals.update(goal.id, { currentPhaseId: phase.id });
    const task = await tasks.create({ title: "节点通信", scheduledDate: "2026-09-10", goalId: goal.id, phaseId: phase.id });
    await plans.deletePhase(phase.id);
    expect((await tasks.findById(task.id))?.phaseId).toBeNull();
    expect((await goals.findById(goal.id))?.currentPhaseId).toBeNull();
    expect((await plans.listHistory(goal.id)).some((entry) => entry.field === "phase_deleted")).toBe(true);
  });
});
