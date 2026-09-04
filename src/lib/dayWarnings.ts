/** 今日页右侧提醒栏的纯计算（v2.3.x）：与 UI 解耦，便于单测。 */
import { formatTimeRange } from "./timeline";

/** 建议每日计划容量（分钟，同原 DayPlanWarnings）。 */
export const DAILY_CAPACITY_MIN = 8 * 60;

export interface PlanTaskLike {
  id: number;
  title: string;
  status: string;
  plannedStart: number | null;
  plannedEnd: number | null;
}

export interface ConflictPair {
  a: PlanTaskLike;
  b: PlanTaskLike;
  /** 展示用时间段（按 a 的时间） */
  rangeLabel: string;
}

/** 检测带计划时间的 TODO 任务间的两两重叠（左闭右开）。 */
export function listConflicts(tasks: PlanTaskLike[]): ConflictPair[] {
  const planned = tasks.filter(
    (t) => t.status === "TODO" && t.plannedStart != null && t.plannedEnd != null,
  );
  const out: ConflictPair[] = [];
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const a = planned[i];
      const b = planned[j];
      const overlap =
        a.plannedStart! < b.plannedEnd! && b.plannedStart! < a.plannedEnd!;
      if (overlap) {
        out.push({ a, b, rangeLabel: formatTimeRange(a.plannedStart!, a.plannedEnd!) });
      }
    }
  }
  return out;
}

/** 计划总时长超出建议容量的分钟数（<=0 表示未超载）。 */
export function overloadMinutes(tasks: PlanTaskLike[]): number {
  const total = tasks
    .filter((t) => t.status === "TODO" && t.plannedStart != null && t.plannedEnd != null)
    .reduce((s, t) => s + (t.plannedEnd! - t.plannedStart!), 0);
  return Math.max(0, Math.round(total / 60_000) - DAILY_CAPACITY_MIN);
}

export interface ReminderSummary {
  /** 昨日未完成任务数（0 = 无） */
  overdueCount: number;
  /** 时间冲突对 */
  conflicts: ConflictPair[];
  /** 超载分钟数（0 = 未超载） */
  overload: number;
}

/** 今日提醒摘要：昨日未完成 + 时间冲突 + 日程超载。 */
export function computeReminderSummary(
  tasks: PlanTaskLike[],
  overdueCount: number,
): ReminderSummary {
  return {
    overdueCount,
    conflicts: listConflicts(tasks),
    overload: overloadMinutes(tasks),
  };
}

/** 是否有任何提醒（右栏是否显示的依据）。 */
export function hasAnyReminder(s: ReminderSummary): boolean {
  return s.overdueCount > 0 || s.conflicts.length > 0 || s.overload > 0;
}
