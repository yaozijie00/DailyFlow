import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers";
import { GoalRepository } from "./goalRepository";
import { ProjectRepository } from "./projectRepository";
import { TaskRepository } from "./taskRepository";
import { FocusSessionRepository } from "./focusSessionRepository";
import { PlanningRepository } from "./planningRepository";

describe("长期周承诺与执行归属", () => {
  let data: Awaited<ReturnType<typeof createTestDb>>;
  let repo: PlanningRepository;
  beforeEach(async () => { data = await createTestDb(); repo = new PlanningRepository(data.db); });
  afterEach(() => data.close());
  it("周目标调整保留最初承诺，不改其他周，修改有历史记录", async () => {
    const plan = await new GoalRepository(data.db).create({ title: "UE", weeklyTargetMinutes: 360 });
    const key = `plan:${plan.id}`;
    await repo.setWeek(key, "2026-09-14", 360, "本周学习");
    await repo.setWeek(key, "2026-09-14", 240, "临时事务");
    await repo.setWeek(key, "2026-09-21", 300, "下周安排");
    expect(await repo.getWeek(key, "2026-09-14")).toMatchObject({ originalMinutes: 360, targetMinutes: 240 });
    expect(await repo.getWeek(key, "2026-09-21")).toMatchObject({ originalMinutes: 300, targetMinutes: 300 });
    expect((await repo.history(key)).filter((entry) => entry.field === "weekly_target")).toHaveLength(3);
    await expect(repo.setWeek(key, "2026-09-15", 100)).rejects.toThrow();
    await expect(repo.setWeek(key, "2026-09-14", -10)).rejects.toThrow();
  });
  it("任务改变归属或删除后保留发生时的投入归属", async () => {
    const goals = new GoalRepository(data.db);
    const a = await goals.create({ title: "A" });
    const b = await goals.create({ title: "B" });
    const tasks = new TaskRepository(data.db);
    const task = await tasks.create({ title: "练习", scheduledDate: "2026-09-16", goalId: a.id });
    await new FocusSessionRepository(data.db).create({ taskId: task.id, plannedDuration: 1800, actualDuration: 1800, startedAt: new Date(2026, 8, 16, 10).getTime() });
    await tasks.update(task.id, { goalId: b.id });
    expect(await repo.actualMinutes(`plan:${a.id}`, "2026-09-14", "2026-09-21")).toBe(30);
    expect(await repo.actualMinutes(`plan:${b.id}`, "2026-09-14", "2026-09-21")).toBe(0);
    await tasks.delete(task.id);
    expect(await repo.actualMinutes(`plan:${a.id}`, "2026-09-14", "2026-09-21")).toBe(30);
  });
  it("项目准备与制作状态独立，归档后保留完成状态", async () => {
    const project = await new ProjectRepository(data.db).create({ title: "YuJie" });
    const key = `project:${project.id}`;
    await repo.updateMeta(key, { lifecycle: "preparation", preparationJson: JSON.stringify([{ title: "找到参考", done: true }]) });
    expect(await repo.getMeta(key)).toMatchObject({ lifecycle: "preparation" });
    await repo.updateMeta(key, { lifecycle: "completed", archivedAt: 123 });
    expect(await repo.getMeta(key)).toMatchObject({ lifecycle: "completed", archivedAt: 123 });
    await expect(repo.updateMeta("project:99999", { lifecycle: "active" })).rejects.toThrow();
  });
  it("明确保存复盘快照，不因后续目标改变改写历史", async () => {
    const plan = await new GoalRepository(data.db).create({ title: "UE" });
    await repo.setWeek(`plan:${plan.id}`, "2026-09-14", 360);
    const id = await repo.saveReview({ periodStart: "2026-09-14", periodEnd: "2026-09-21", kind: "week", snapshot: [{ key: `plan:${plan.id}`, title: "UE", plannedMinutes: 360, actualMinutes: 120 }], decisions: [{ key: `plan:${plan.id}`, decision: "减少下周投入" }], note: "保留练习时间" });
    await repo.setWeek(`plan:${plan.id}`, "2026-09-14", 120);
    const review = (await repo.listReviews()).find((entry) => entry.id === id)!;
    expect(JSON.parse(review.snapshotJson)[0].plannedMinutes).toBe(360);
    expect(review.note).toBe("保留练习时间");
  });
});
