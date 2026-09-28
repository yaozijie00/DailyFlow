import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers";
import { GoalRepository } from "./goalRepository";
import { PlanningRepository } from "./planningRepository";

describe("长期元数据与兼容视图一致", () => {
  let data: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { data = await createTestDb(); });
  afterEach(() => data.close());
  it("调整周投入不会重新启用已停用的手动进度", async () => {
    const goals = new GoalRepository(data.db), planning = new PlanningRepository(data.db);
    const plan = await goals.create({ title: "UE", manualProgress: 25, progressMode: "tasks" });
    const key = `plan:${plan.id}`;
    await planning.updateMeta(key, { weeklyTargetMinutes: 120 });
    expect((await goals.findById(plan.id))?.progressMode).toBe("tasks");
    await goals.update(plan.id, { manualProgress: 40, progressMode: "manual" });
    await goals.update(plan.id, { progressMode: "tasks" });
    await planning.updateMeta(key, { weeklyTargetMinutes: 180 });
    expect((await goals.findById(plan.id))?.progressMode).toBe("tasks");
  });
  it("新工作台的编辑原子同步旧 Goal 视图，旧入口修改也同步新界面", async () => {
    const goals = new GoalRepository(data.db), planning = new PlanningRepository(data.db);
    const plan = await goals.create({ title: "UE", status: "not_started" });
    const key = `plan:${plan.id}`;
    await planning.updateMeta(key, { description: "能力目标", weeklyTargetMinutes: 240, lifecycle: "idea" });
    expect(await goals.findById(plan.id)).toMatchObject({ description: "能力目标", weeklyTargetMinutes: 240, status: "not_started" });
    expect((await planning.getMeta(key))?.lifecycle).toBe("idea");
    await goals.update(plan.id, { status: "active", weeklyTargetMinutes: 360 });
    expect(await planning.getMeta(key)).toMatchObject({ lifecycle: "active", weeklyTargetMinutes: 360 });
  });
});
