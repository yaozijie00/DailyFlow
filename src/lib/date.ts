/** 返回本地时区的今天日期，格式 YYYY-MM-DD。 */
export function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 返回本地时区的昨天日期，格式 YYYY-MM-DD（逾期结转提示用）。 */
export function yesterdayString(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
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

/** 指定日期本地时区 0 点的时间戳（Unix ms）。 */
export function startOfDay(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 本周一本地时区 0 点的时间戳（Unix ms；周一为一周起点）。 */
export function startOfWeek(date: Date = new Date()): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=周日 .. 6=周六
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.getTime();
}

/** 本月 1 日本地时区 0 点的时间戳（Unix ms）。 */
export function startOfMonth(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

/** 给定时间戳所属的本地日期字符串 YYYY-MM-DD。 */
export function dateStringOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 解析 YYYY-MM-DD 为本地 0 点时间戳；非法返回 NaN。 */
export function dateStringToStart(ymd: string): number {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ymd.trim());
  if (!m) return NaN;
  const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(ts) ? NaN : ts;
}

/** 日期标题，如「8月25日 星期二」；非法输入原样返回。 */
export function formatDateLabel(ymd: string): string {
  const ts = dateStringToStart(ymd);
  if (Number.isNaN(ts)) return ymd;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayLabel(d)}`;
}
