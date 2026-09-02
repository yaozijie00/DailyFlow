/**
 * 月视图纯工具（V2/v1.6 长期规划）：
 * - 月度日时间轴：当月每天一个独立日期列（非 7 列周视图）
 * - 动态天数（28/29/30/31，跨年正确）
 * - 任务块按「日偏移 × 日宽」定位，跨月裁剪
 * 无 UI 依赖，便于单测。
 */

/** 本地 YYYY-MM-DD。 */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 解析 YYYY-MM-DD（本地时区）。非法返回 null。 */
export function parseDateKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

/** 某月自然日数（2 月 28/29、大小月自动）。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** 日期字符串 → 星期名（周一为首）。 */
export function weekdayOf(dateStr: string): string {
  const d = parseDateKey(dateStr);
  if (!d) return "";
  return WEEKDAY_NAMES[(d.getDay() + 6) % 7];
}

export interface MonthDay {
  /** YYYY-MM-DD */
  date: string;
  /** 当月日号 1..N */
  day: number;
  /** 周几（周一..周日） */
  weekday: string;
  /** 是否今天 */
  isToday: boolean;
}

/** 生成当月每天的日期列（连续横向时间轴，1..daysInMonth）。 */
export function monthDays(year: number, month: number, today = dateKey(new Date())): MonthDay[] {
  const n = daysInMonth(year, month);
  const out: MonthDay[] = [];
  for (let d = 1; d <= n; d++) {
    const date = dateKey(new Date(year, month, d));
    out.push({ date, day: d, weekday: weekdayOf(date), isToday: date === today });
  }
  return out;
}

/** 月份标题，如「2026年9月」。 */
export function monthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

/**
 * 任务块在某月内的日跨度（1-based 天号，闭区间）。
 * 与本月无交集返回 null；跨月任务裁剪到月边界。
 */
export function daySpanInMonth(
  startDate: string | null,
  endDate: string | null,
  year: number,
  month: number,
): { start: number; end: number } | null {
  if (!startDate || !endDate) return null;
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) return null;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  if (end < monthStart || start > monthEnd) return null;
  const s = start < monthStart ? 1 : start.getDate();
  const e = end > monthEnd ? daysInMonth(year, month) : end.getDate();
  return { start: Math.min(s, e), end: Math.max(s, e) };
}

/** 把任务块平移 delta 天（返回新 [startDate, endDate]），无日期范围返回 null。 */
export function shiftDateRange(
  startDate: string | null,
  endDate: string | null,
  deltaDays: number,
): { startDate: string; endDate: string } | null {
  if (!startDate || !endDate) return null;
  const s = parseDateKey(startDate);
  const e = parseDateKey(endDate);
  if (!s || !e) return null;
  s.setDate(s.getDate() + deltaDays);
  e.setDate(e.getDate() + deltaDays);
  return { startDate: dateKey(s), endDate: dateKey(e) };
}
