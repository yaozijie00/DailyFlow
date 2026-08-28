/** 返回本地时区的今天日期，格式 YYYY-MM-DD。 */
export function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 返回中文星期，如「星期六」。 */
export function weekdayLabel(date: Date = new Date()): string {
  return `星期${WEEKDAYS[date.getDay()]}`;
}

/** 今天本地时区 0 点的时间戳（Unix ms）。 */
export function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** 明天本地时区 0 点的时间戳（Unix ms）。 */
export function startOfTomorrow(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}
