/** 课程表纯工具（2.0.x） */
export const SCHEDULE_WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/** 课程表默认显示 08:00–22:00（14 个小时格）。 */
export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_HOURS = 14;
export const SCHEDULE_ROW_H = 40;

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
