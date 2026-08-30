import { dateStringOf } from "./date";

/**
 * 日历纯函数（本地时区，周一起始）。
 * 供今日页的日期选择 popover 使用。
 */

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string;
  /** 日（1-31） */
  day: number;
  /** 是否属于当前视图月份 */
  inMonth: boolean;
  /** 是否今天 */
  isToday: boolean;
}

export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 某年某月（1-based）的天数（正确处理闰年）。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 生成固定 42 格（6 周）的月历网格，周一起始，含前后月补齐。 */
export function getMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // 周一=0
  const start = new Date(year, month - 1, 1 - firstWeekday);
  const today = dateStringOf(Date.now());
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = dateStringOf(d.getTime());
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1,
      isToday: date === today,
    });
  }
  return cells;
}

/** 月份标题，如「2026年8月」。 */
export function monthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}
