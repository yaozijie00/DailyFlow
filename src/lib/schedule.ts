/** 课程表纯工具（2.2.x：时间窗跟随「时间轴开始/结束」设置，本文件提供参数化网格数学）。 */
export const SCHEDULE_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/** 课程表默认展示窗口 08:00–24:00（跟随设置；这里仅作兜底默认值）。 */
export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_END_HOUR = 24;
export const SCHEDULE_HOURS = SCHEDULE_END_HOUR - SCHEDULE_START_HOUR;
export const SCHEDULE_ROW_H = 40;

/** 课程表默认可视时间窗（分钟）。 */
export const SCHEDULE_GRID_START_MIN = SCHEDULE_START_HOUR * 60;
export const SCHEDULE_GRID_END_MIN = SCHEDULE_END_HOUR * 60;

/** 课程块最短时长（分钟，拖上下边缩小时的下限）。 */
export const MIN_SLOT_MINUTES = 30;

/** 网格内容最大总高（px）：行高自适应，避免 24 小时窗口把页面撑爆。 */
export const SCHEDULE_MAX_TOTAL_PX = 560;
/** 行高下限（px），窗口极宽时也不至于挤成一团。 */
export const SCHEDULE_MIN_ROW_H = 22;

/** 依据小时数取合理行高（px）：小时越多行越矮，总高 ≈560px。 */
export function rowHeightForWindow(hourCount: number): number {
  const n = Math.max(1, Math.round(hourCount));
  return Math.max(SCHEDULE_MIN_ROW_H, Math.min(SCHEDULE_ROW_H, Math.round(SCHEDULE_MAX_TOTAL_PX / n)));
}

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

/**
 * 分钟内 → 像素偏移（相对可视窗起点 originMinutes，每小时 pxPerHour 像素）。
 * 默认参数保持旧行为（起点 08:00、每小 40px），供既有测试与兜底使用。
 */
export function minutesToPx(
  minutes: number,
  pxPerHour: number = SCHEDULE_ROW_H,
  originMinutes: number = SCHEDULE_GRID_START_MIN,
): number {
  return ((minutes - originMinutes) * pxPerHour) / 60;
}

/** 像素 Y（相对列顶）→ 分钟（起点 originMinutes 起，每小时 pxPerHour 像素）。 */
export function pxToMinutes(
  y: number,
  pxPerHour: number = SCHEDULE_ROW_H,
  originMinutes: number = SCHEDULE_GRID_START_MIN,
): number {
  return originMinutes + (y / pxPerHour) * 60;
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

/** 把（吸附后的）开始分钟夹取到可视时间窗 [gridStart, gridEnd] 内，保证整块可见。 */
export function clampGridStart(
  startMinutes: number,
  durationMinutes: number,
  gridStart: number = SCHEDULE_GRID_START_MIN,
  gridEnd: number = SCHEDULE_GRID_END_MIN,
): number {
  const maxStart = Math.max(gridStart, gridEnd - durationMinutes);
  return Math.min(Math.max(startMinutes, gridStart), maxStart);
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
  gridStart: number = SCHEDULE_GRID_START_MIN,
  gridEnd: number = SCHEDULE_GRID_END_MIN,
): ResizedSlot {
  if (edge === "start") {
    const end = origStart + origDuration;
    const maxStart = Math.max(gridStart, end - MIN_SLOT_MINUTES);
    const start = Math.min(Math.max(targetMinutes, gridStart), maxStart);
    return { startMinutes: start, durationMinutes: end - start };
  }
  const end = Math.min(Math.max(targetMinutes, origStart + MIN_SLOT_MINUTES), gridEnd);
  return { startMinutes: origStart, durationMinutes: end - origStart };
}
