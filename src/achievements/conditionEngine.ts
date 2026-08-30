/**
 * 成就条件引擎（纯函数，无 UI/业务耦合）。
 *
 * 设计原则：
 * - 成就条件完全数据驱动（来自 src/achievements/*.json）；
 * - 业务代码不针对具体成就 ID 做判断；
 * - UI 只消费 getProgress 的结果，不知道成就如何计算；
 * - 时长类条件 target 单位为「分钟」，current 统一为「分钟」；
 * - 预留 and/or/not 组合（第一阶段不暴露配置，但引擎支持）。
 */

export interface EventCountCondition {
  type: "event_count";
  target: number;
}
export interface TotalDurationCondition {
  type: "total_duration";
  target: number;
}
export interface CategoryDurationCondition {
  type: "category_duration";
  categoryName: string;
  target: number;
}
export interface DailyDurationCondition {
  type: "daily_duration";
  target: number;
}
export interface StreakDaysCondition {
  type: "streak_days";
  target: number;
}
export interface CategoryCountCondition {
  type: "category_count";
  target: number;
}
export interface AndCondition {
  type: "and";
  conditions: Condition[];
}
export interface OrCondition {
  type: "or";
  conditions: Condition[];
}
export interface NotCondition {
  type: "not";
  condition: Condition;
}

export type Condition =
  | EventCountCondition
  | TotalDurationCondition
  | CategoryDurationCondition
  | DailyDurationCondition
  | StreakDaysCondition
  | CategoryCountCondition
  | AndCondition
  | OrCondition
  | NotCondition;

export type ProgressUnit = "count" | "minutes" | "days";

export interface Progress {
  current: number;
  target: number;
  percentage: number;
  completed: boolean;
  unit: ProgressUnit;
}

/** 成就评估上下文：由 WorkEvent（focus_sessions）聚合而来。 */
export interface AchievementContext {
  /** 累计走满番茄数 */
  completedCount: number;
  /** 累计实际投入时长（秒） */
  totalDurationSeconds: number;
  /** 各（有效）类别名称 → 累计投入秒数 */
  categoryDurations: Map<string, number>;
  /** 单日最高投入时长（秒） */
  maxDailyDurationSeconds: number;
  /** 连续工作天数（今天往前，每天 ≥1 个走满番茄） */
  streakDays: number;
  /** 完成过工作的不同（有效）类别数 */
  distinctCategories: number;
}

function pct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function minutesOf(seconds: number): number {
  return seconds / 60;
}

/** 递归校验条件结构是否合法（target 为正数、categoryName 非空等）。 */
export function isValidCondition(cond: unknown): boolean {
  if (typeof cond !== "object" || cond === null) return false;
  const c = cond as Record<string, unknown>;
  switch (c.type) {
    case "event_count":
    case "total_duration":
    case "daily_duration":
    case "streak_days":
    case "category_count":
      return typeof c.target === "number" && Number.isFinite(c.target) && c.target > 0;
    case "category_duration":
      return (
        typeof c.categoryName === "string" &&
        c.categoryName.trim().length > 0 &&
        typeof c.target === "number" &&
        Number.isFinite(c.target) &&
        c.target > 0
      );
    case "and":
    case "or":
      return Array.isArray(c.conditions) && c.conditions.every(isValidCondition);
    case "not":
      return isValidCondition(c.condition);
    default:
      return false;
  }
}

export const ConditionEngine = {
  /** 条件是否达标。 */
  evaluate(condition: Condition, ctx: AchievementContext): boolean {
    switch (condition.type) {
      case "event_count":
        return ctx.completedCount >= condition.target;
      case "total_duration":
        return minutesOf(ctx.totalDurationSeconds) >= condition.target;
      case "category_duration":
        return minutesOf(ctx.categoryDurations.get(condition.categoryName) ?? 0) >= condition.target;
      case "daily_duration":
        return minutesOf(ctx.maxDailyDurationSeconds) >= condition.target;
      case "streak_days":
        return ctx.streakDays >= condition.target;
      case "category_count":
        return ctx.distinctCategories >= condition.target;
      case "and":
        return condition.conditions.every((c) => ConditionEngine.evaluate(c, ctx));
      case "or":
        return condition.conditions.some((c) => ConditionEngine.evaluate(c, ctx));
      case "not":
        return !ConditionEngine.evaluate(condition.condition, ctx);
    }
  },

  /** 进度：current/target/percentage/completed/unit。UI 据此显示，无需理解成就类型。 */
  getProgress(condition: Condition, ctx: AchievementContext): Progress {
    switch (condition.type) {
      case "event_count": {
        const current = ctx.completedCount;
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "count",
        };
      }
      case "total_duration": {
        const current = minutesOf(ctx.totalDurationSeconds);
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "minutes",
        };
      }
      case "category_duration": {
        const current = minutesOf(ctx.categoryDurations.get(condition.categoryName) ?? 0);
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "minutes",
        };
      }
      case "daily_duration": {
        const current = minutesOf(ctx.maxDailyDurationSeconds);
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "minutes",
        };
      }
      case "streak_days": {
        const current = ctx.streakDays;
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "days",
        };
      }
      case "category_count": {
        const current = ctx.distinctCategories;
        return {
          current,
          target: condition.target,
          percentage: pct(current, condition.target),
          completed: current >= condition.target,
          unit: "count",
        };
      }
      case "and": {
        const satisfied = condition.conditions.filter((c) => ConditionEngine.evaluate(c, ctx)).length;
        return {
          current: satisfied,
          target: condition.conditions.length,
          percentage: pct(satisfied, condition.conditions.length),
          completed: satisfied === condition.conditions.length,
          unit: "count",
        };
      }
      case "or": {
        const satisfied = condition.conditions.some((c) => ConditionEngine.evaluate(c, ctx)) ? 1 : 0;
        return { current: satisfied, target: 1, percentage: satisfied * 100, completed: satisfied === 1, unit: "count" };
      }
      case "not": {
        const inner = ConditionEngine.getProgress(condition.condition, ctx);
        return { ...inner, completed: !inner.completed, percentage: inner.completed ? 0 : 100 };
      }
    }
  },
};
