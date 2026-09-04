import { describe, it, expect } from "vitest";
import {
  DAILY_CAPACITY_MIN,
  computeReminderSummary,
  hasAnyReminder,
  listConflicts,
  overloadMinutes,
  type PlanTaskLike,
} from "./dayWarnings";

const t = (id: number, title: string, start: number | null, end: number | null): PlanTaskLike => ({
  id,
  title,
  status: "TODO",
  plannedStart: start,
  plannedEnd: end,
});

const H = 3_600_000;

describe("dayWarnings（今日提醒纯计算）", () => {
  it("listConflicts：重叠检出、首尾相接不算、完成/无计划不参与", () => {
    const tasks = [
      t(1, "开发", 9 * H, 11 * H),
      t(2, "会议", 10 * H, 11 * H),
      t(3, "无缝", 11 * H, 12 * H), // 与 1 首尾相接 → 不算
      t(4, "已完成", 10 * H, 12 * H),
    ];
    tasks[3] = { ...tasks[3], status: "COMPLETED" };
    const conflicts = listConflicts(tasks);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].a.id).toBe(1);
    expect(conflicts[0].b.id).toBe(2);
    expect(conflicts[0].rangeLabel).toContain("-"); // 时间范围展示存在
  });

  it("overloadMinutes：总时长超出容量才算；不足为 0", () => {
    // 3 × 3.5h = 630min > 480
    expect(
      overloadMinutes([t(1, "A", 9 * H, 12.5 * H), t(2, "B", 13 * H, 16.5 * H), t(3, "C", 17 * H, 20.5 * H)]),
    ).toBe(630 - DAILY_CAPACITY_MIN);
    expect(overloadMinutes([t(1, "A", 9 * H, 11 * H)])).toBe(0);
  });

  it("computeReminderSummary / hasAnyReminder", () => {
    const s = computeReminderSummary([t(1, "A", 9 * H, 11 * H), t(2, "B", 10 * H, 11 * H)], 3);
    expect(s.overdueCount).toBe(3);
    expect(s.conflicts.length).toBe(1);
    expect(hasAnyReminder(s)).toBe(true);
    expect(hasAnyReminder(computeReminderSummary([], 0))).toBe(false);
  });
});
