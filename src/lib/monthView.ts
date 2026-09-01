/**
 * 月视图纯工具（V2 长期规划）：
 * - 月份网格（周一为一周首日）
 * - 日期字符串 / 解析
 * - 任务块在月网格中的定位（开始列 / 跨天宽度）
 * 无 UI 依赖，便于单测。
 */

/** 本地 YYYY-MM-DD。 */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 解析 YYYY-MM-DD（本地时区，当日 00:00）。非法返回 null。 */
export function parseDateKey(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null;
  }
  return d;
}

export interface MonthCell {
  /** YYYY-MM-DD */
  date: string;
  /** 当月日号（1..31） */
  day: number;
  /** 是否属于当月（false 为上/下月补位） */
  inMonth: boolean;
}

/** 构建某月的网格（周一为一周首日），首尾用相邻月日期补齐到整周。 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  // 周一=0 ... 周日=6
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) {
    const d = new Date(year, month, 1 - (lead - i));
    cells.push({ date: dateKey(d), day: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: dateKey(new Date(year, month, d)), day: d, inMonth: true });
  }
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= tail; i++) {
    const d = new Date(year, month, daysInMonth + i);
    cells.push({ date: dateKey(d), day: d.getDate(), inMonth: false });
  }
  return cells;
}

/** 月份标题，如「2026年9月」。 */
export function monthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

/** 日期字符串比较是否 a <= b。 */
export function dateLE(a: string, b: string): boolean {
  return a <= b;
}

/**
 * 计算任务块在某月网格中的跨度：
 * 返回 [startIndex, endIndex]（闭区间，列下标）；若与本月无交集返回 null。
 * 无开始/结束日期时视为「未安排」由调用方单独处理。
 */
export function spanInGrid(
  startDate: string | null,
  endDate: string | null,
  cells: MonthCell[],
): { startIndex: number; endIndex: number } | null {
  if (!startDate || !endDate) return null;
  const first = cells[0].date;
  const last = cells[cells.length - 1].date;
  const s = startDate < first ? first : startDate;
  const e = endDate > last ? last : endDate;
  if (s > last || e < first || s > e) return null;
  const startIndex = cells.findIndex((c) => c.date === s);
  const endIndex = cells.findIndex((c) => c.date === e);
  if (startIndex < 0 || endIndex < 0) return null;
  return { startIndex: Math.min(startIndex, endIndex), endIndex: Math.max(startIndex, endIndex) };
}

/** 把任务块平移 delta 天（返回新 [startDate, endDate]），无日期范围则返回 null。 */
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
