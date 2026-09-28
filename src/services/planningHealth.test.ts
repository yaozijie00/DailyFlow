import { afterEach, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../db/test-helpers";
import { GoalRepository } from "../db/repositories/goalRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { PlanningWorkspaceService } from "./planningWorkspaceService";
import { planningHealth, readPlanningActivity } from "./planningHealth";

const day = 86400000, now = new Date(2026, 8, 21, 12).getTime();
const base = { lifecycle: "active", archivedAt: null, nextAction: "写一页", targetDate: null, createdAt: now - 20 * day, lastActivityAt: null };
let close: (() => void) | undefined;
afterEach(() => { close?.(); close = undefined; vi.restoreAllMocks(); });

it("only flags inactivity at the 14-day boundary, with a creation grace period", () => {
  expect(planningHealth({ ...base, createdAt: now - 14 * day + 1 }, now)).toEqual([]);
  expect(planningHealth({ ...base, createdAt: now - 14 * day }, now).map((reason) => reason.code)).toEqual(["stalled"]);
  expect(planningHealth({ ...base, lastActivityAt: now - 14 * day + 1 }, now)).toEqual([]);
  expect(planningHealth({ ...base, createdAt: now - day, lastActivityAt: now - 40 * day }, now)).toEqual([]);
});
it("missing dates do not imply lateness and today's date is still available", () => {
  const recent = { ...base, lastActivityAt: now - day };
  expect(planningHealth(recent, now)).toEqual([]);
  expect(planningHealth({ ...recent, targetDate: "2026-09-21" }, now)).toEqual([]);
  expect(planningHealth({ ...recent, targetDate: "2026-09-20" }, now)).toEqual([expect.objectContaining({ code: "target_review", label: "回顾目标日期" })]);
  expect(planningHealth({ ...recent, nextAction: "  " }, now).map((reason) => reason.code)).toEqual(["missing_next_action"]);
});
it("paused, completed, archived and idea items have no pressure signals", () => {
  for (const lifecycle of ["paused", "completed", "archived", "idea"]) {
    expect(planningHealth({ ...base, lifecycle, nextAction: null, targetDate: "2026-01-01" }, now)).toEqual([]);
  }
  expect(planningHealth({ ...base, archivedAt: now, nextAction: null }, now)).toEqual([]);
  expect(planningHealth({ ...base, lifecycle: "not_started" }, now)).toEqual([]);
});
it("one bulk read uses effective focus and dated completions, not task cache or metadata edits", async () => {
  const data = await createTestDb(); close = data.close;
  const goal = await new GoalRepository(data.db).create({ title: "旧计划", nextAction: "继续", status: "active" });
  const taskRepo = new TaskRepository(data.db);
  const task = await taskRepo.create({ title: "历史缓存", scheduledDate: "", goalId: goal.id, actualDuration: 3600 });
  await data.db.run(sql`UPDATE goals SET created_at=${now - 30 * day},updated_at=${now} WHERE id=${goal.id}`);
  const query = vi.spyOn(data.db, "values");
  expect((await readPlanningActivity(data.db, now)).get(`plan:${goal.id}`)).toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
  vi.spyOn(Date, "now").mockReturnValue(now);
  expect((await new PlanningWorkspaceService(data.db).list("2026-09-21"))[0].health?.map((reason) => reason.code)).toEqual(["stalled"]);
  await taskRepo.update(task.id, { status: "COMPLETED", completedAt: now - day });
  expect((await readPlanningActivity(data.db, now)).get(`plan:${goal.id}`)).toBe(now - day);
  await taskRepo.update(task.id, { status: "TODO", completedAt: null });
  await data.db.run(sql`INSERT INTO focus_sessions(id,task_id,planned_duration,actual_duration,started_at,ended_at,created_at,completed) VALUES(500,${task.id},0,600,${now - 20 * day},${now},${now},0)`);
  // Legacy wall-clock end is not evidence that the whole pause gap was worked.
  expect((await readPlanningActivity(data.db, now)).get(`plan:${goal.id}`)).toBe(now - 20 * day);
  await data.db.run(sql`INSERT INTO focus_segments(session_id,started_at,ended_at,effective_ms) VALUES(500,${now - day - 600000},${now - day},600000),(500,${now - 600000},${now},0)`);
  expect((await readPlanningActivity(data.db, now)).get(`plan:${goal.id}`)).toBe(now - day);
  await taskRepo.delete(task.id);
  expect((await readPlanningActivity(data.db, now)).get(`plan:${goal.id}`)).toBe(now - day);
});
