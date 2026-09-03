/** 课程表 → 今日联动（2.0.x）：由每周时段算出指定日期的课程。 */
import type { SlotView } from "../db/repositories/courseRepository";

/** 周一=1..周日=7（与 weekly_slots.weekday 一致）。 */
export function weekdayIndexOf(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ((d.getDay() + 6) % 7) + 1;
}

/** 指定日期当天应出现的课程（按开始时间排序）。 */
export function slotsForDate(slots: SlotView[], dateStr: string): SlotView[] {
  const wd = weekdayIndexOf(dateStr);
  return slots
    .filter((s) => s.weekday === wd)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}
