/** 课程表纯工具（2.0.x） */
export const SCHEDULE_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/** 课程表默认显示 08:00–22:00（14 个小时格）。 */
export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_HOURS = 14;
export const SCHEDULE_ROW_H = 40;

/** 课程表可视时间窗（分钟）：块必须完全落在窗内，避免排到看不见的区域。 */
export const SCHEDULE_GRID_START_MIN = SCHEDULE_START_HOUR * 60;
export const SCHEDULE_GRID_END_MIN = (SCHEDULE_START_HOUR + SCHEDULE_HOURS) * 60;

/** 课程块最短时长（分钟，拖上下边缩小时的下限）。 */
export const MIN_SLOT_MINUTES = 30;

/** 分钟 → "HH:MM" */
export function minutesLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 15 分钟吸附并夹取到 0..1439。 */
export function snapMinutes(m: number, step = 15): number {
  return Math.max(0, Math.min(1439, Math.round(m / step) * step));
}

/** 分钟内 → 像素偏移（基于每小时 ROW_H px）。 */
export function minutesToPx(minutes: number): number {
  return ((minutes - SCHEDULE_START_HOUR * 60) * SCHEDULE_ROW_H) / 60;
}

export interface TimeSpanLike {
  weekday: number;
  startMinutes: number;
  durationMinutes: number;
}

/** 同一星期内两个时段是否重叠（左闭右开 [start, start+duration)）。 */
export function spansOverlap(a: TimeSpanLike, b: TimeSpanLike): boolean {
  if (a.weekday !== b.weekday) return false;
  return (
    a.startMinutes < b.startMinutes + b.durationMinutes &&
    b.startMinutes < a.startMinutes + a.durationMinutes
  );
}

/**
 * 目标时段（同星期）是否与现有安排重叠；`ignoreId` 用于块自身拖拽时忽略自己。
 */
export function isOccupied(
  spans: Array<TimeSpanLike & { id?: number }>,
  weekday: number,
  startMinutes: number,
  durationMinutes: number,
  ignoreId?: number,
): boolean {
  const target: TimeSpanLike = { weekday, startMinutes, durationMinutes };
  return spans.some((s) => s.id !== ignoreId && spansOverlap(s, target));
}

/** 把（吸附后的）开始分钟夹取到可视时间窗内，保证整块可见。 */
export function clampGridStart(startMinutes: number, durationMinutes: number): number {
  const maxStart = Math.max(SCHEDULE_GRID_START_MIN, SCHEDULE_GRID_END_MIN - durationMinutes);
  return Math.min(Math.max(startMinutes, SCHEDULE_GRID_START_MIN), maxStart);
}

export interface ResizedSlot {
  startMinutes: number;
  durationMinutes: number;
}

/**
 * 上下边缘拖拽调整（与时间轴任务块一致，吸附已由调用方完成）：
 * - edge="start"：改开始、结束不动（时长随之增减），且不短于 MIN_SLOT_MINUTES；
 * - edge="end"：改结束（开始不动），且不短于 MIN_SLOT_MINUTES、不超过可视窗。
 */
export function resizeSlot(
  origStart: number,
  origDuration: number,
  edge: "start" | "end",
  targetMinutes: number,
): ResizedSlot {
  if (edge === "start") {
    const end = origStart + origDuration;
    const maxStart = Math.max(SCHEDULE_GRID_START_MIN, end - MIN_SLOT_MINUTES);
    const start = Math.min(Math.max(targetMinutes, SCHEDULE_GRID_START_MIN), maxStart);
    return { startMinutes: start, durationMinutes: end - start };
  }
  const end = Math.min(
    Math.max(targetMinutes, origStart + MIN_SLOT_MINUTES),
    SCHEDULE_GRID_END_MIN,
  );
  return { startMinutes: origStart, durationMinutes: end - origStart };
}
