import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { focusSessions } from "../db/schema";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { StatisticsService } from "./statisticsService";

/**
 * v1.7 规模正确性：统计已下沉为 SQL 聚合（SUM/GROUP BY），
 * 以「独立生成口径」校验万级会话下各维度结果与 JS 逐条计算一致。
 */
describe("StatisticsService SQL 聚合（万级会话）", () => {
  let db: Db;
  let close: () => void;
  let svc: StatisticsService;
  let sessions: FocusSessionRepository;

  const DAY0 = new Date(2026, 8, 1).getTime(); // 2026-09-01
  const DAYS = 30;
  const PER_DAY = 200; // 共 6000 条
  const START_HOUR_MS = 9 * 3_600_000;

  /** 生成口径（测试侧独立计算，用于与 SQL 结果对照）。 */
  function spec(): {
    total: number;
    completed: number;
    byDay: Map<string, { seconds: number; completed: number }>;
    byHour: Map<number, number>;
  } {
    const byDay = new Map<string, { seconds: number; completed: number }>();
    const byHour = new Map<number, number>();
    let total = 0;
    let completed = 0;
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(2026, 8, 1 + d);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      let sec = 0;
      let cmp = 0;
      for (let i = 0; i < PER_DAY; i++) {
        const dur = 1500 + ((i + d) % 7) * 60;
        const done = (i + d) % 3 === 0;
        total += dur;
        if (done) completed += 1;
        sec += dur;
        if (done) cmp += 1;
        const hour = 9 + Math.floor((i % 4) / 2); // 09:00/09:30 → 9；10:00/10:30 → 10
        byHour.set(hour, (byHour.get(hour) ?? 0) + dur);
      }
      byDay.set(key, { seconds: sec, completed: cmp });
    }
    return { total, completed, byDay, byHour };
  }

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    sessions = new FocusSessionRepository(db);
    svc = new StatisticsService(
      new TaskRepository(db),
      sessions,
      new CategoryRepository(db),
    );
    // 批量插入 6000 条会话（分块，避免逐条往返）
    const chunk: Array<{ taskId: null; plannedDuration: number; startedAt: number; actualDuration: number; endedAt: number; completed: boolean; createdAt: number }> = [];
    const pushChunk = async () => {
      if (chunk.length === 0) return;
      await db.insert(focusSessions).values(chunk).run();
      chunk.length = 0;
    };
    for (let d = 0; d < DAYS; d++) {
      const dayStart = DAY0 + d * 86_400_000;
      for (let i = 0; i < PER_DAY; i++) {
        chunk.push({
          taskId: null,
          plannedDuration: 1800,
          startedAt: dayStart + START_HOUR_MS + (i % 4) * 30 * 60_000,
          actualDuration: 1500 + ((i + d) % 7) * 60,
          endedAt: dayStart + START_HOUR_MS + (i % 4) * 30 * 60_000 + 30 * 60_000,
          completed: (i + d) % 3 === 0,
          createdAt: dayStart,
        });
        if (chunk.length >= 1000) await pushChunk();
      }
    }
    await pushChunk();
  });

  afterEach(() => close());

  it("summary/overview 总量与独立口径一致（6000 条）", async () => {
    const spec_ = spec();
    const from = DAY0;
    const to = DAY0 + DAYS * 86_400_000;

    const range = await svc.getRangeStatistics(from, to);
    expect(range.totalSeconds).toBe(spec_.total);
    expect(range.eventCount).toBe(DAYS * PER_DAY);
    expect(range.completedCount).toBe(spec_.completed);

    const ov = await svc.getOverview(from, to);
    expect(ov.totalSeconds).toBe(spec_.total);
    expect(ov.sessionCount).toBe(DAYS * PER_DAY);
    expect(ov.completedFocusCount).toBe(spec_.completed);
    expect(ov.avgSessionSeconds).toBe(Math.round(spec_.total / (DAYS * PER_DAY)));
  });

  it("daily 聚合 = 逐日独立口径（30 天全对齐）", async () => {
    const spec_ = spec();
    const from = DAY0;
    const to = DAY0 + DAYS * 86_400_000;

    const daily = await svc.getDailyStatistics(from, to);
    expect(daily).toHaveLength(DAYS);
    let sum = 0;
    for (const row of daily) {
      const want = spec_.byDay.get(row.date);
      expect(want).toBeDefined();
      expect(row.seconds).toBe(want!.seconds);
      expect(row.completedCount).toBe(want!.completed);
      sum += row.seconds;
    }
    expect(sum).toBe(spec_.total);
  });

  it("hourly 聚合只落在 9/10 时段且与口径一致", async () => {
    const spec_ = spec();
    const from = DAY0;
    const to = DAY0 + DAYS * 86_400_000;
    const hourly = await svc.getHourlyStatistics(from, to);
    expect(hourly).toHaveLength(24);
    let sum = 0;
    for (const h of hourly) {
      const want = spec_.byHour.get(h.hour) ?? 0;
      expect(h.seconds).toBe(want);
      sum += h.seconds;
    }
    expect(sum).toBe(spec_.total);
    expect(hourly[9].seconds).toBeGreaterThan(0);
    expect(hourly[10].seconds).toBeGreaterThan(0);
  });
});
