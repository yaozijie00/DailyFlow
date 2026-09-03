import { describe, it, expect } from "vitest";
import {
  computeTaskStreak,
  computeEstimateStreak,
} from "./achievementService";
import { ConditionEngine, isValidCondition, type AchievementContext, type Condition } from "../achievements/conditionEngine";

function ctx(partial: Partial<AchievementContext> = {}): AchievementContext {
  return {
    completedCount: 0,
    totalDurationSeconds: 0,
    categoryDurations: new Map(),
    maxDailyDurationSeconds: 0,
    streakDays: 0,
    distinctCategories: 0,
    completedTasks: 0,
    maxDailyCompletedTasks: 0,
    plannedTasks: 0,
    completedPlannedTasks: 0,
    categoryNames: [],
    createdTasks: 0,
    weeklyReviewStreak: 0,
    taskStreakDays: 0,
    nightFocusCount: 0,
    estimateAccurateStreak: 0,
    courseTasksCompleted: 0,
    undoCountToday: 0,
    ...partial,
  };
}

const d = (day: number) => `2026-09-${String(day).padStart(2, "0")}`;

describe("computeTaskStreak（连续执行，允许 1 天宽限）", () => {
  it("今天有任务：连续 3 天 → 3", () => {
    expect(computeTaskStreak(new Set([d(28), d(27), d(26)]), d(28))).toBe(3);
  });
  it("中间缺 1 天不打断：28/26/25 → 3（27 为宽限）", () => {
    expect(computeTaskStreak(new Set([d(28), d(26), d(25)]), d(28))).toBe(3);
  });
  it("连续缺 2 天停止：28/25 → 1", () => {
    expect(computeTaskStreak(new Set([d(28), d(25)]), d(28))).toBe(1);
  });
  it("今天缺但昨天有 → 1（今天视为宽限继续回溯）", () => {
    expect(computeTaskStreak(new Set([d(27)]), d(28))).toBe(1);
  });
  it("无任何完成 → 0", () => {
    expect(computeTaskStreak(new Set(), d(28))).toBe(0);
  });
});

describe("ConditionEngine task_streak_days", () => {
  it("评估与进度（单位 days）", () => {
    const c: Condition = { type: "task_streak_days", target: 7 };
    expect(ConditionEngine.evaluate(c, ctx({ taskStreakDays: 3 }))).toBe(false);
    expect(ConditionEngine.evaluate(c, ctx({ taskStreakDays: 7 }))).toBe(true);
    const p = ConditionEngine.getProgress(c, ctx({ taskStreakDays: 3 }));
    expect(p).toMatchObject({ current: 3, target: 7, unit: "days", completed: false });
    expect(isValidCondition({ type: "task_streak_days", target: 7 })).toBe(true);
    expect(isValidCondition({ type: "task_streak_days", target: 0 })).toBe(false);
  });
});

describe("计划准确 / 夜猫子", () => {
  it("computeEstimateStreak：按完成时间倒序连续误差 ≤15%", () => {
    const samples = [
      { estimatedSeconds: 3600, actualSeconds: 3800, completedAt: 30 }, // +5.6% ✓
      { estimatedSeconds: 3600, actualSeconds: 4200, completedAt: 20 }, // +16.7% ✗
      { estimatedSeconds: 1800, actualSeconds: 1900, completedAt: 10 }, // 更早，不参与
    ];
    expect(computeEstimateStreak(samples)).toBe(1);
    expect(
      computeEstimateStreak([
        { estimatedSeconds: 3600, actualSeconds: 3900, completedAt: 2 },
        { estimatedSeconds: 600, actualSeconds: 540, completedAt: 1 },
      ]),
    ).toBe(2);
  });

  it("night_sessions / estimate_streak：评估与校验", () => {
    expect(ConditionEngine.evaluate({ type: "night_sessions", target: 3 } as Condition, ctx({ nightFocusCount: 3 }))).toBe(true);
    expect(ConditionEngine.evaluate({ type: "estimate_streak", target: 5 } as Condition, ctx({ estimateAccurateStreak: 4 }))).toBe(false);
    expect(isValidCondition({ type: "night_sessions", target: 3 })).toBe(true);
    expect(isValidCondition({ type: "estimate_streak", target: 0 })).toBe(false);
  });

  it("course_tasks_completed：课程任务计数评估", () => {
    expect(ConditionEngine.evaluate({ type: "course_tasks_completed", target: 1 } as Condition, ctx({ courseTasksCompleted: 1 }))).toBe(true);
    expect(ConditionEngine.evaluate({ type: "course_tasks_completed", target: 10 } as Condition, ctx({ courseTasksCompleted: 9 }))).toBe(false);
    const p = ConditionEngine.getProgress({ type: "course_tasks_completed", target: 10 } as Condition, ctx({ courseTasksCompleted: 3 }));
    expect(p).toMatchObject({ current: 3, target: 10, unit: "count", completed: false });
    expect(isValidCondition({ type: "course_tasks_completed", target: 10 })).toBe(true);
  });

  it("undo_daily：撤回大师条件", () => {
    expect(ConditionEngine.evaluate({ type: "undo_daily", target: 10 } as Condition, ctx({ undoCountToday: 10 }))).toBe(true);
    expect(ConditionEngine.evaluate({ type: "undo_daily", target: 10 } as Condition, ctx({ undoCountToday: 3 }))).toBe(false);
    expect(isValidCondition({ type: "undo_daily", target: 10 })).toBe(true);
    expect(isValidCondition({ type: "undo_daily", target: 0 })).toBe(false);
  });
});
