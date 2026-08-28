import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { StatisticsService } from "./statisticsService";
import { todayString, startOfToday } from "../lib/date";

describe("StatisticsService", () => {
  let db: Db;
  let close: () => void;
  let tasks: TaskRepository;
  let sessions: FocusSessionRepository;
  let service: StatisticsService;

  beforeEach(async () => {
    // 固定「今天」= 2026-08-27，保证统计边界确定
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 10, 0, 0));

    const t = await createTestDb();
    db = t.db;
    close = t.close;
    tasks = new TaskRepository(db);
    sessions = new FocusSessionRepository(db);
    service = new StatisticsService(tasks, sessions);
  });

  afterEach(() => {
    vi.useRealTimers();
    close();
  });

  it("实时聚合今日五项统计（全部来自原始表，无冗余落库）", async () => {
    const today = todayString(); // 2026-08-27
    // 任务：今日 3 个（1 完成、1 待办、1 取消），昨日 1 个
    const a = await tasks.create({ title: "A", scheduledDate: today });
    await tasks.create({ title: "B", scheduledDate: today, status: "COMPLETED" });
    await tasks.create({ title: "C", scheduledDate: today, status: "CANCELLED" });
    await tasks.create({ title: "D", scheduledDate: "2026-08-26" });

    // 专注：今日 2 次（900s + 1500s），昨日 1 次
    const from = startOfToday();
    await sessions.create({
      taskId: a.id,
      plannedDuration: 1500,
      startedAt: from + 1000,
      actualDuration: 900,
      endedAt: from + 901_000,
      completed: true,
    });
    await sessions.create({
      taskId: a.id,
      plannedDuration: 1500,
      startedAt: from + 2000,
      actualDuration: 1500,
      endedAt: from + 1_502_000,
      completed: true,
    });
    await sessions.create({
      taskId: a.id,
      plannedDuration: 1500,
      startedAt: new Date(2026, 7, 26, 23, 0).getTime(), // 昨日，不计
      actualDuration: 999,
    });

    const stats = await service.getTodayStats();
    expect(stats.totalTasks).toBe(3); // A、B、C（含已取消，与列表一致）
    expect(stats.completedTasks).toBe(1); // B
    expect(stats.completionRate).toBeCloseTo(1 / 3, 5);
    expect(stats.totalFocusSeconds).toBe(2400); // 900 + 1500
    expect(stats.focusCount).toBe(2);
  });

  it("无任何数据时全部为 0", async () => {
    const stats = await service.getTodayStats();
    expect(stats).toEqual({
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      totalFocusSeconds: 0,
      focusCount: 0,
    });
  });

  it("今日无专注会话时专注统计为 0", async () => {
    await tasks.create({ title: "A", scheduledDate: todayString() });
    const stats = await service.getTodayStats();
    expect(stats.totalFocusSeconds).toBe(0);
    expect(stats.focusCount).toBe(0);
  });
});
