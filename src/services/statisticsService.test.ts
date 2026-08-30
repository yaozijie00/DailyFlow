import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { StatisticsService } from "./statisticsService";
import { todayString, startOfToday } from "../lib/date";

describe("StatisticsService", () => {
  let db: Db;
  let close: () => void;
  let tasks: TaskRepository;
  let sessions: FocusSessionRepository;
  let categories: CategoryRepository;
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
    categories = new CategoryRepository(db);
    service = new StatisticsService(tasks, sessions, categories);
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

  describe("范围/类别/日/小时聚合", () => {
    const FROM = new Date(2026, 7, 27).getTime(); // 2026-08-27 00:00
    const TO = new Date(2026, 7, 28).getTime();

    async function makeSession(categoryId: number | null, seconds: number, completed: boolean, startedAt: number) {
      const task = await tasks.create({
        title: "T",
        scheduledDate: todayString(),
        categoryId,
      });
      return sessions.create({
        taskId: task.id,
        categoryId,
        plannedDuration: seconds,
        startedAt,
        actualDuration: seconds,
        endedAt: startedAt + seconds * 1000,
        completed,
      });
    }

    it("getRangeStatistics：时长计全部、番茄数只计走满", async () => {
      await makeSession(null, 900, true, FROM + 1000); // 走满
      await makeSession(null, 600, false, FROM + 2000); // 提前结束
      const s = await service.getRangeStatistics(FROM, TO);
      expect(s.totalSeconds).toBe(1500);
      expect(s.completedCount).toBe(1);
      expect(s.eventCount).toBe(2);
    });

    it("getRangeStatistics：空数据全 0", async () => {
      const s = await service.getRangeStatistics(FROM, TO);
      expect(s).toEqual({ totalSeconds: 0, completedCount: 0, eventCount: 0 });
    });

    it("getCategoryStatistics：按类别聚合、按时长降序", async () => {
      const dev = await categories.create("开发");
      const art = await categories.create("美术");
      await makeSession(dev.id, 1200, true, FROM + 1000); // 开发 20min
      await makeSession(art.id, 900, true, FROM + 2000); // 美术 15min
      await makeSession(dev.id, 300, false, FROM + 3000); // 开发 5min
      const stats = await service.getCategoryStatistics(FROM, TO);
      expect(stats).toHaveLength(2);
      expect(stats[0]).toMatchObject({ categoryId: dev.id, name: "开发", seconds: 1500 });
      expect(stats[1]).toMatchObject({ categoryId: art.id, name: "美术", seconds: 900 });
      expect(stats[0].color).toBeTruthy();
    });

    it("getCategoryStatistics：类别删除后归入「已删除类别」", async () => {
      const dev = await categories.create("开发");
      await makeSession(dev.id, 600, true, FROM + 1000);
      await categories.delete(dev.id); // 删除类别，session 快照保留
      const stats = await service.getCategoryStatistics(FROM, TO);
      expect(stats).toHaveLength(1);
      expect(stats[0].name).toBe("已删除类别");
      expect(stats[0].seconds).toBe(600);
    });

    it("getCategoryStatistics：无类别会话归入「已删除类别」", async () => {
      await makeSession(null, 300, false, FROM + 1000);
      const stats = await service.getCategoryStatistics(FROM, TO);
      expect(stats[0].name).toBe("已删除类别");
    });

    it("getDailyStatistics：跨天按本地日期分组", async () => {
      await makeSession(null, 900, true, new Date(2026, 7, 26, 23, 30).getTime()); // 26 日
      await makeSession(null, 600, false, new Date(2026, 7, 27, 9, 0).getTime()); // 27 日
      await makeSession(null, 1500, true, new Date(2026, 7, 27, 10, 0).getTime());
      const stats = await service.getDailyStatistics(
        new Date(2026, 7, 26).getTime(),
        TO,
      );
      expect(stats).toEqual([
        { date: "2026-08-26", seconds: 900, completedCount: 1 },
        { date: "2026-08-27", seconds: 2100, completedCount: 1 },
      ]);
    });

    it("getHourlyStatistics：返回完整 24 桶并按开始小时聚合", async () => {
      await makeSession(null, 1800, true, new Date(2026, 7, 27, 8, 0).getTime()); // 08 点
      await makeSession(null, 900, false, new Date(2026, 7, 27, 14, 30).getTime()); // 14 点
      const stats = await service.getHourlyStatistics(FROM, TO);
      expect(stats).toHaveLength(24);
      expect(stats[8]).toEqual({ hour: 8, seconds: 1800 });
      expect(stats[14]).toEqual({ hour: 14, seconds: 900 });
      expect(stats[0]).toEqual({ hour: 0, seconds: 0 });
    });

    it("getRangeStatistics 边界：from 含、to 不含", async () => {
      await makeSession(null, 900, true, FROM); // 恰在 from
      await makeSession(null, 600, true, TO); // 恰在 to（不含）
      const s = await service.getRangeStatistics(FROM, TO);
      expect(s.totalSeconds).toBe(900);
      expect(s.eventCount).toBe(1);
    });
  });
});
