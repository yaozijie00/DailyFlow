import type { Task } from "../db/repositories/taskRepository";

/**
 * Task 规划时间 与 Focus 时长的约束（纯函数，无 UI/DB 依赖）。
 *
 * 关系：Task(plannedStart/End 或 estimatedDuration) → 规划时长
 *       → 剩余 = 规划时长 − 已实际投入(actualDuration)
 *       → 新 Focus 建议不超过剩余。
 */
type ConstraintTask = Pick<
  Task,
  "plannedStart" | "plannedEnd" | "estimatedDuration" | "actualDuration"
>;

/**
 * Task 规划时长（ms）：优先时间轴 plannedStart/End 之差，其次 estimatedDuration；
 * 两者均无 → 返回 null（无约束，不限制 Focus）。
 */
export function plannedDurationMs(task: ConstraintTask): number | null {
  if (task.plannedStart != null && task.plannedEnd != null) {
    const d = task.plannedEnd - task.plannedStart;
    if (d > 0) return d;
  }
  if (task.estimatedDuration != null && task.estimatedDuration > 0) {
    return task.estimatedDuration * 1000;
  }
  return null;
}

/**
 * Task 剩余可专注时长（ms）：规划时长 − 已实际投入（秒 × 1000）。
 * 无规划 → null；可为负（已超出规划，仍允许继续但需用户确认）。
 */
export function remainingFocusMs(task: ConstraintTask): number | null {
  const planned = plannedDurationMs(task);
  if (planned == null) return null;
  return planned - (task.actualDuration ?? 0) * 1000;
}

/** 剩余时长展示：不足 1 分钟按 1 分钟；0 或负显示「0 分钟」。 */
export function remainingMinutesLabel(remainingMs: number): string {
  if (remainingMs <= 0) return "0 分钟";
  return `${Math.max(1, Math.round(remainingMs / 60_000))} 分钟`;
}

/** 本次 Focus 建议时长：若超过剩余则夹到剩余（至少 1 分钟）；无约束返回原时长。 */
export function clampFocusToRemaining(
  durationMs: number,
  remainingMs: number | null,
): number {
  if (remainingMs == null || remainingMs >= durationMs) return durationMs;
  return Math.max(60_000, Math.round(remainingMs / 60_000) * 60_000);
}
