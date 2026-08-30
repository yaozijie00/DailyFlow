import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { FocusSessionRepository } from "./focusSessionRepository";
import { TaskRepository } from "./taskRepository";

describe("FocusSessionRepository", () => {
  let db: Db;
  let close: () => void;
  let sessions: FocusSessionRepository;
  let tasks: TaskRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    sessions = new FocusSessionRepository(db);
    tasks = new TaskRepository(db);
  });

  afterEach(() => close());

  async function makeTask() {
    return tasks.create({ title: "写代码", scheduledDate: "2026-08-27" });
  }

  it("creates a focus session", async () => {
    const task = await makeTask();
    const session = await sessions.create({
      taskId: task.id,
      plannedDuration: 1500,
      startedAt: Date.now(),
    });
    expect(session.id).toBeGreaterThan(0);
    expect(session.taskId).toBe(task.id);
    expect(session.actualDuration).toBe(0);
    expect(session.completed).toBe(false);
    expect(session.endedAt).toBeNull();
  });

  it("finds an open session (ended_at is null)", async () => {
    const task = await makeTask();
    await sessions.create({ taskId: task.id, plannedDuration: 1500, startedAt: Date.now() });
    const open = await sessions.findOpen();
    expect(open?.taskId).toBe(task.id);
  });

  it("closes a session by setting ended_at", async () => {
    const task = await makeTask();
    const session = await sessions.create({
      taskId: task.id,
      plannedDuration: 1500,
      startedAt: Date.now(),
    });
    const closed = await sessions.update(session.id, {
      endedAt: Date.now(),
      actualDuration: 1500,
      completed: true,
    });
    expect(closed?.endedAt).not.toBeNull();
    expect(closed?.completed).toBe(true);
    expect(closed?.actualDuration).toBe(1500);
  });

  it("lists sessions for a task", async () => {
    const task = await makeTask();
    await sessions.create({ taskId: task.id, plannedDuration: 1500, startedAt: Date.now() });
    await sessions.create({ taskId: task.id, plannedDuration: 1500, startedAt: Date.now() });
    const list = await sessions.findByTaskId(task.id);
    expect(list).toHaveLength(2);
  });

  it("rejects a session referencing a non-existent task (FK)", async () => {
    await expect(
      sessions.create({ taskId: 9999, plannedDuration: 1500, startedAt: Date.now() }),
    ).rejects.toThrow();
  });

  it("删除任务后 focus_session 保留且 task_id 置空（不再级联删除）", async () => {
    const task = await makeTask();
    const session = await sessions.create({
      taskId: task.id,
      plannedDuration: 1500,
      startedAt: Date.now(),
    });
    await tasks.delete(task.id);
    const kept = await sessions.findById(session.id);
    expect(kept).not.toBeNull();
    expect(kept?.taskId).toBeNull();
  });

  describe("getTodayStats", () => {
    const FROM = new Date(2026, 7, 27).getTime(); // 2026-08-27 00:00
    const TO = new Date(2026, 7, 28).getTime(); // 2026-08-28 00:00
    const YESTERDAY = new Date(2026, 7, 26, 23, 0).getTime();

    it("统计时间段内开始会话的实际时长总和与次数", async () => {
      const task = await makeTask();
      await sessions.create({
        taskId: task.id,
        plannedDuration: 1500,
        startedAt: FROM + 1000,
        actualDuration: 900,
        endedAt: FROM + 901_000,
        completed: true,
      });
      await sessions.create({
        taskId: task.id,
        plannedDuration: 1500,
        startedAt: FROM + 2000,
        actualDuration: 1500,
        endedAt: FROM + 1_502_000,
        completed: true,
      });
      await sessions.create({
        taskId: task.id,
        plannedDuration: 1500,
        startedAt: YESTERDAY, // 时间段外，不计
        actualDuration: 999,
        endedAt: YESTERDAY + 999_000,
        completed: true,
      });

      const stats = await sessions.getTodayStats(FROM, TO);
      expect(stats.count).toBe(2);
      expect(stats.totalSeconds).toBe(900 + 1500);
    });

    it("无会话时返回 0", async () => {
      const stats = await sessions.getTodayStats(FROM, TO);
      expect(stats).toEqual({ count: 0, totalSeconds: 0 });
    });
  });
});
