export type LongTermPriority = "p1" | "p2" | "p3" | "p4";
export type LongTermStatus = "not_started" | "active" | "paused" | "completed" | "archived";
export type PlanHealthState = "ahead" | "healthy" | "slightly_behind" | "seriously_behind" | "paused" | "unknown";

export function normalizeLongTermPriority(value: string | null | undefined): LongTermPriority {
  if (value === "p1" || value === "high") return "p1";
  if (value === "p3" || value === "low") return "p3";
  if (value === "p4") return "p4";
  return "p2";
}

export function progressFromEstimatedMinutes(
  items: Array<{ status: string; estimatedMinutes: number | null }>,
): number {
  const active = items.filter((item) => item.status !== "CANCELLED");
  if (active.length === 0) return 0;
  const maximumProgress = active.every((item) => item.status === "COMPLETED") ? 100 : 99;
  const total = active.reduce((sum, item) => sum + Math.max(0, item.estimatedMinutes ?? 0), 0);
  // A partial estimate cannot represent all work; use the visible task count instead.
  if (total <= 0 || active.some((item) => !Number.isFinite(item.estimatedMinutes) || (item.estimatedMinutes ?? 0) <= 0)) {
    return Math.min(maximumProgress, Math.round((active.filter((item) => item.status === "COMPLETED").length / active.length) * 100));
  }
  const completed = active
    .filter((item) => item.status === "COMPLETED")
    .reduce((sum, item) => sum + Math.max(0, item.estimatedMinutes ?? 0), 0);
  return Math.min(maximumProgress, Math.round((completed / total) * 100));
}

/** Elapsed-time reference only; dates alone do not establish an outcome baseline. */
export function plannedProgressAt(startDate: string | null, targetDate: string | null, now = new Date()): number | null {
  if (!startDate || !targetDate) return null;
  const start = parseLocalDate(startDate).getTime();
  const end = parseLocalDate(targetDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now.getTime()) || end <= start) return null;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - start) / (end - start)) * 100)));
}

export function calculatePlanHealth(input: {
  status: string;
  /** Expected outcome progress from an explicit baseline, not elapsed calendar time. */
  plannedProgress?: number | null;
  actualProgress?: number | null;
}): { state: PlanHealthState; deviationPercent: number | null } {
  const validProgress = (value: number | null | undefined): value is number =>
    value != null && Number.isFinite(value) && value >= 0 && value <= 100;
  const deviationPercent = validProgress(input.actualProgress) && validProgress(input.plannedProgress)
    ? Math.round(input.actualProgress - input.plannedProgress) : null;
  if (input.status === "paused") return { state: "paused", deviationPercent };
  if (deviationPercent == null) return { state: "unknown", deviationPercent: null };
  if (deviationPercent >= 5) return { state: "ahead", deviationPercent };
  if (deviationPercent >= -5) return { state: "healthy", deviationPercent };
  if (deviationPercent >= -20) return { state: "slightly_behind", deviationPercent };
  return { state: "seriously_behind", deviationPercent };
}

export function estimateCompletionDate(
  fromDate: string,
  remainingMinutes: number,
  weeklyMinutes: number,
  options: { completed?: boolean } = {},
): string | null {
  const result = parseLocalDate(fromDate);
  if (!Number.isFinite(result.getTime())) return null;
  if (options.completed) return fromDate;
  if (!Number.isFinite(weeklyMinutes) || !Number.isFinite(remainingMinutes) || weeklyMinutes <= 0 || remainingMinutes <= 0) return null;
  const weeks = remainingMinutes / weeklyMinutes;
  result.setDate(result.getDate() + Math.ceil(weeks * 7));
  if (!Number.isFinite(result.getTime())) return null;
  return formatLocalDate(result);
}

/**
 * 用计划开始以来的实际专注记录估算每周速度；数据不足时回退到计划周投入。
 * 首周按完整 7 天计算，避免刚开始一两天时把速度夸大。
 */
export function effectiveWeeklyPaceMinutes(
  startDate: string | null,
  totalFocusSeconds: number,
  weeklyTargetMinutes: number,
  now = new Date(),
): number {
  if (!startDate || totalFocusSeconds <= 0) return Math.max(0, weeklyTargetMinutes);
  const start = parseLocalDate(startDate).getTime();
  const elapsedMs = now.getTime() - start;
  if (!Number.isFinite(start) || elapsedMs <= 0) return Math.max(0, weeklyTargetMinutes);
  const elapsedDays = Math.max(7, elapsedMs / 86400000);
  const observed = Math.round((totalFocusSeconds / 60) * (7 / elapsedDays));
  return observed > 0 ? observed : Math.max(0, weeklyTargetMinutes);
}

const PRIORITY_ORDER: Record<LongTermPriority, number> = { p1: 1, p2: 2, p3: 3, p4: 4 };

export function calculateCapacity(
  capacityMinutes: number,
  plans: Array<{ id: number; priority: LongTermPriority; weeklyTargetMinutes: number }>,
): {
  requiredMinutes: number;
  capacityMinutes: number;
  overloadMinutes: number;
  adjustmentCandidateIds: number[];
} {
  const requiredMinutes = plans.reduce((sum, plan) => sum + Math.max(0, plan.weeklyTargetMinutes), 0);
  const overloadMinutes = Math.max(0, requiredMinutes - capacityMinutes);
  let remaining = overloadMinutes;
  const adjustmentCandidateIds: number[] = [];
  for (const plan of [...plans].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])) {
    if (remaining <= 0) break;
    adjustmentCandidateIds.push(plan.id);
    remaining -= Math.max(0, plan.weeklyTargetMinutes);
  }
  return { requiredMinutes, capacityMinutes, overloadMinutes, adjustmentCandidateIds };
}

export function startOfLocalWeek(date = new Date()): number {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d.getTime();
}

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(NaN);
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(0);
  result.setHours(0, 0, 0, 0);
  result.setFullYear(year, month - 1, day);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day
    ? result : new Date(NaN);
}

function formatLocalDate(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
