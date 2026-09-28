import { expect, it } from "vitest";
import { createTestDb } from "./test-helpers";
import { runMigrations } from "./migrate";
import { GoalRepository } from "./repositories/goalRepository";
import { TaskRepository } from "./repositories/taskRepository";
import { FocusSessionRepository } from "./repositories/focusSessionRepository";
import { PlanningRepository } from "./repositories/planningRepository";
import { focusAttributions } from "./planningSchema";

it("现有用户升级后保留任务和投入，历史推断有标记，重复迁移不改写承诺", async () => {
  const files = import.meta.glob("./migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const legacy = Object.fromEntries(Object.entries(files).filter(([path]) => path.split("/").pop()! < "0028"));
  const data = await createTestDb(undefined, { files: legacy });
  try {
    const goals = new GoalRepository(data.db), tasks = new TaskRepository(data.db);
    const plan = await goals.create({ title: "升级前学习计划", weeklyTargetMinutes: 360 });
    const task = await tasks.create({ title: "已有练习", scheduledDate: "2026-09-16", goalId: plan.id });
    await new FocusSessionRepository(data.db).create({ taskId: task.id, plannedDuration: 1800, actualDuration: 1800, startedAt: new Date(2026, 8, 16).getTime(), endedAt: new Date(2026, 8, 16, 0, 30).getTime() });
    await runMigrations(data.db);
    const planning = new PlanningRepository(data.db);
    const key = `plan:${plan.id}`;
    expect((await tasks.findById(task.id))?.title).toBe("已有练习");
    expect(await planning.actualMinutes(key, "2026-09-14", "2026-09-21")).toBe(30);
    expect((await data.db.select().from(focusAttributions).get())?.inferred).toBe(true);
    await planning.setWeek(key, "2026-09-14", 360);
    await planning.setWeek(key, "2026-09-14", 240);
    expect(await runMigrations(data.db)).toEqual([]);
    expect(await planning.getWeek(key, "2026-09-14")).toMatchObject({ originalMinutes: 360, targetMinutes: 240 });
  } finally { data.close(); }
});
