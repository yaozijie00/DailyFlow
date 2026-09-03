import { describe, it, expect } from "vitest";
import {
  ConditionEngine,
  isValidCondition,
  type AchievementContext,
  type Condition,
} from "./conditionEngine";

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

describe("ConditionEngine", () => {
  it("event_count：1 个达成 target 1；9 个未达 target 10；10 个达成", () => {
    const c1: Condition = { type: "event_count", target: 1 };
    const c10: Condition = { type: "event_count", target: 10 };
    expect(ConditionEngine.evaluate(c1, ctx({ completedCount: 1 }))).toBe(true);
    expect(ConditionEngine.evaluate(c10, ctx({ completedCount: 9 }))).toBe(false);
    expect(ConditionEngine.evaluate(c10, ctx({ completedCount: 10 }))).toBe(true);
  });

  it("total_duration：target 单位分钟，内部秒换算", () => {
    const c: Condition = { type: "total_duration", target: 60 };
    expect(ConditionEngine.evaluate(c, ctx({ totalDurationSeconds: 3599 }))).toBe(false);
    expect(ConditionEngine.evaluate(c, ctx({ totalDurationSeconds: 3600 }))).toBe(true);
  });

  it("category_duration：按类别名称、119min 未达 120min、120min 达成", () => {
    const c: Condition = { type: "category_duration", categoryName: "开发", target: 120 };
    expect(
      ConditionEngine.evaluate(
        c,
        ctx({ categoryDurations: new Map([["开发", 119 * 60]]) }),
      ),
    ).toBe(false);
    expect(
      ConditionEngine.evaluate(
        c,
        ctx({ categoryDurations: new Map([["开发", 120 * 60]]) }),
      ),
    ).toBe(true);
  });

  it("daily_duration：单日 4 小时", () => {
    const c: Condition = { type: "daily_duration", target: 240 };
    expect(ConditionEngine.evaluate(c, ctx({ maxDailyDurationSeconds: 240 * 60 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ maxDailyDurationSeconds: 239 * 60 }))).toBe(false);
  });

  it("streak_days：连续天数", () => {
    const c: Condition = { type: "streak_days", target: 3 };
    expect(ConditionEngine.evaluate(c, ctx({ streakDays: 3 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ streakDays: 2 }))).toBe(false);
  });

  it("category_count：不同类别数", () => {
    const c: Condition = { type: "category_count", target: 5 };
    expect(ConditionEngine.evaluate(c, ctx({ distinctCategories: 5 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ distinctCategories: 4 }))).toBe(false);
  });

  it("tasks_completed：累计完成任务数", () => {
    const c: Condition = { type: "tasks_completed", target: 10 };
    expect(ConditionEngine.evaluate(c, ctx({ completedTasks: 10 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ completedTasks: 9 }))).toBe(false);
  });

  it("daily_tasks_completed：单日完成任务数峰值", () => {
    const c: Condition = { type: "daily_tasks_completed", target: 5 };
    expect(ConditionEngine.evaluate(c, ctx({ maxDailyCompletedTasks: 5 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ maxDailyCompletedTasks: 4 }))).toBe(false);
  });

  it("planned_tasks / planned_tasks_completed：时间轴规划与按计划完成", () => {
    const planned: Condition = { type: "planned_tasks", target: 1 };
    expect(ConditionEngine.evaluate(planned, ctx({ plannedTasks: 1 }))).toBe(true);
    const plannedDone: Condition = { type: "planned_tasks_completed", target: 1 };
    expect(ConditionEngine.evaluate(plannedDone, ctx({ completedPlannedTasks: 1 }))).toBe(true);
    expect(ConditionEngine.evaluate(plannedDone, ctx({ plannedTasks: 5, completedPlannedTasks: 0 }))).toBe(false);
  });

  it("任务类条件 isValidCondition 校验", () => {
    expect(isValidCondition({ type: "tasks_completed", target: 1 })).toBe(true);
    expect(isValidCondition({ type: "daily_tasks_completed", target: 3 })).toBe(true);
    expect(isValidCondition({ type: "planned_tasks", target: 1 })).toBe(true);
    expect(isValidCondition({ type: "planned_tasks_completed", target: 1 })).toBe(true);
    expect(isValidCondition({ type: "tasks_completed", target: 0 })).toBe(false);
  });

  it("category_named：类别名包含关键词（忽略大小写）", () => {
    const c: Condition = { type: "category_named", keyword: "摸鱼" };
    expect(ConditionEngine.evaluate(c, ctx({ categoryNames: ["工作", "摸鱼时间"] }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ categoryNames: ["工作", "学习"] }))).toBe(false);
    const game: Condition = { type: "category_named", keyword: "GAME" };
    expect(ConditionEngine.evaluate(game, ctx({ categoryNames: ["Game Dev"] }))).toBe(true);
  });

  it("tasks_created：累计创建任务数", () => {
    const c: Condition = { type: "tasks_created", target: 1 };
    expect(ConditionEngine.evaluate(c, ctx({ createdTasks: 1 }))).toBe(true);
    expect(ConditionEngine.evaluate(c, ctx({ createdTasks: 0 }))).toBe(false);
  });

  it("weekly_reviews：按周连续复盘达标，进度单位 weeks", () => {
    const c: Condition = { type: "weekly_reviews", target: 4 };
    expect(ConditionEngine.evaluate(c, ctx({ weeklyReviewStreak: 3 }))).toBe(false);
    expect(ConditionEngine.evaluate(c, ctx({ weeklyReviewStreak: 4 }))).toBe(true);
    const p = ConditionEngine.getProgress(c, ctx({ weeklyReviewStreak: 2 }));
    expect(p).toMatchObject({ current: 2, target: 4, unit: "weeks", completed: false });
    expect(isValidCondition({ type: "weekly_reviews", target: 4 })).toBe(true);
    expect(isValidCondition({ type: "weekly_reviews", target: 0 })).toBe(false);
  });

  it("彩蛋条件 isValidCondition 校验", () => {
    expect(isValidCondition({ type: "category_named", keyword: "摸鱼" })).toBe(true);
    expect(isValidCondition({ type: "category_named", keyword: "" })).toBe(false);
    expect(isValidCondition({ type: "tasks_created", target: 1 })).toBe(true);
    expect(isValidCondition({ type: "tasks_created", target: 0 })).toBe(false);
  });

  it("getProgress 返回 current/target/percentage/completed/unit", () => {
    const p = ConditionEngine.getProgress(
      { type: "event_count", target: 50 },
      ctx({ completedCount: 37 }),
    );
    expect(p).toMatchObject({ current: 37, target: 50, completed: false, unit: "count" });
    expect(p.percentage).toBe(74);
  });

  it("getProgress：时长类 unit=minutes", () => {
    const p = ConditionEngine.getProgress(
      { type: "total_duration", target: 600 },
      ctx({ totalDurationSeconds: 2220 }), // 37 分钟
    );
    expect(p.unit).toBe("minutes");
    expect(p.current).toBe(37);
  });

  it("and/or/not 组合（预留）", () => {
    const and: Condition = {
      type: "and",
      conditions: [
        { type: "event_count", target: 10 },
        { type: "total_duration", target: 60 },
      ],
    };
    expect(ConditionEngine.evaluate(and, ctx({ completedCount: 10, totalDurationSeconds: 3600 }))).toBe(true);
    expect(ConditionEngine.evaluate(and, ctx({ completedCount: 10, totalDurationSeconds: 0 }))).toBe(false);

    const or: Condition = {
      type: "or",
      conditions: [
        { type: "event_count", target: 10 },
        { type: "streak_days", target: 7 },
      ],
    };
    expect(ConditionEngine.evaluate(or, ctx({ completedCount: 10 }))).toBe(true);
    expect(ConditionEngine.evaluate(or, ctx({ streakDays: 7 }))).toBe(true);

    const not: Condition = { type: "not", condition: { type: "event_count", target: 1 } };
    expect(ConditionEngine.evaluate(not, ctx({ completedCount: 0 }))).toBe(true);
    expect(ConditionEngine.evaluate(not, ctx({ completedCount: 1 }))).toBe(false);
  });

  it("isValidCondition 拒绝非法条件", () => {
    expect(isValidCondition({ type: "event_count", target: 1 })).toBe(true);
    expect(isValidCondition({ type: "event_count" })).toBe(false); // 缺 target
    expect(isValidCondition({ type: "event_count", target: 0 })).toBe(false); // target 非正
    expect(isValidCondition({ type: "unknown_type", target: 1 })).toBe(false);
    expect(isValidCondition({ type: "category_duration", target: 10 })).toBe(false); // 缺 categoryName
    expect(isValidCondition(null)).toBe(false);
    expect(isValidCondition("x")).toBe(false);
  });
});
