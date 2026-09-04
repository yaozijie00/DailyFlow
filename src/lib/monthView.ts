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

export type WeekStart = "monday" | "sunday";

/** 依周起始日返回排列表头（周一为首 或 周日为首）。 */
export function weekDayNames(weekStart: WeekStart = "monday"): string[] {
  if (weekStart === "sunday") {
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  }
  return [...WEEKDAY_NAMES];
}

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

/* ==================== 月历网格模型（v1.6.2：7 列 × 4~6 行真实月历） ==================== */

/** 无时区干扰的「天数序号」，用于日差计算（中国无夏令时，仍用 UTC 严谨求差）。 */
function toSerial(dateStr: string): number {
  const d = parseDateKey(dateStr);
  if (!d) return NaN;
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export interface MonthGridCell {
  /** YYYY-MM-DD（含邻月补位日期） */
  date: string;
  /** 日号（1..31，邻月日为邻月日号） */
  day: number;
  /** 周一..周日 */
  weekday: string;
  /** 是否属于当前显示月 */
  inMonth: boolean;
  /** 是否今天 */
  isToday: boolean;
  /** 是否周末 */
  isWeekend: boolean;
}

export interface MonthGridWeek {
  /** 7 个自然日（周一为首），可能含上/下月补位 */
  cells: MonthGridCell[];
  /** 该周起始 YYYY-MM-DD */
  startDate: string;
  /** 该周结束 YYYY-MM-DD */
  endDate: string;
}

/**
 * 生成某月的月历网格：7 列、4~6 行，补位相邻月日期。
 * 周起始日可配置（默认周一为首）；真实日期动态生成（28/29/30/31、闰年、跨年均由 Date 保证）。
 */
export function monthGrid(
  year: number,
  month: number,
  today = dateKey(new Date()),
  weekStart: WeekStart = "monday",
): MonthGridWeek[] {
  const first = new Date(year, month, 1);
  // 行首 = 该月 1 日所在周的首日：周一为首 → (getDay()+6)%7 前补；周日为首 → getDay() 前补
  const leading = weekStart === "sunday" ? first.getDay() : (first.getDay() + 6) % 7;
  const n = daysInMonth(year, month);
  const rows = Math.ceil((leading + n) / 7);
  const start = new Date(year, month, 1 - leading);
  const weeks: MonthGridWeek[] = [];
  for (let w = 0; w < rows; w++) {
    const cells: MonthGridCell[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + c);
      const date = dateKey(d);
      const weekday = WEEKDAY_NAMES[(d.getDay() + 6) % 7];
      cells.push({
        date,
        day: d.getDate(),
        weekday,
        inMonth: d.getFullYear() === year && d.getMonth() === month,
        isToday: date === today,
        isWeekend: weekday === "周六" || weekday === "周日",
      });
    }
    weeks.push({
      cells,
      startDate: cells[0].date,
      endDate: cells[6].date,
    });
  }
  return weeks;
}

/** 目标日期范围的简化输入（段定位只需这些字段）。 */
export interface GoalRangeInput {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  progressPercent: number;
}

/** 目标在某周行内的可视段：按「显示月 ∩ 该周」裁剪。 */
export interface WeekSegment {
  goalId: number;
  title: string;
  /** 0..6 列（闭区间） */
  startCol: number;
  endCol: number;
  /** 该段裁剪后的实际起止 */
  startDate: string;
  endDate: string;
  /** 该段是否为目标的真实首段（左缘可 resize） */
  startsGoal: boolean;
  /** 该段是否为目标的真实末段（右缘可 resize） */
  endsGoal: boolean;
  /** 目标在显示月前已开始（视觉左缘示「延续」） */
  continuesBefore: boolean;
  /** 目标持续到显示月之后（视觉右缘示「延续」） */
  continuesAfter: boolean;
  progressPercent: number;
}

/**
 * 计算目标在某一周行内的段；与「显示月 ∩ 该周」无交集返回 null。
 * 跨周任务自动拆段：每行独立返回一段，同属一个目标。
 */
export function segmentInWeek(
  goal: GoalRangeInput,
  year: number,
  month: number,
  week: MonthGridWeek,
): WeekSegment | null {
  const gs = toSerial(goal.startDate);
  const ge = toSerial(goal.endDate);
  if (!Number.isFinite(gs) || !Number.isFinite(ge) || ge < gs) return null;
  const monthStart = toSerial(dateKey(new Date(year, month, 1)));
  const monthEnd = toSerial(dateKey(new Date(year, month + 1, 0)));
  const ws = toSerial(week.startDate);
  const we = toSerial(week.endDate);
  if (Number.isNaN(monthStart) || Number.isNaN(ws)) return null;
  const lo = Math.max(gs, ws, monthStart);
  const hi = Math.min(ge, we, monthEnd);
  if (lo > hi) return null;
  return {
    goalId: goal.id,
    title: goal.title,
    startCol: lo - ws,
    endCol: hi - ws,
    startDate: fromSerial(lo),
    endDate: fromSerial(hi),
    startsGoal: lo === gs,
    endsGoal: hi === ge,
    continuesBefore: gs < lo,
    continuesAfter: ge > hi,
    progressPercent: goal.progressPercent,
  };
}

/** 序号 → YYYY-MM-DD（本地日期）。 */
function fromSerial(serial: number): string {
  const d = new Date(serial * 86400000);
  return dateKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * 周内分段 → Lane 编号（同一行内互不重叠的轨道；贪心区间着色，先按 startCol 排序）。
 * 返回与入参同序的 lane 下标。
 */
export function assignLanes(
  segs: Array<{ startCol: number; endCol: number }>,
): number[] {
  const order = segs
    .map((_, i) => i)
    .sort((a, b) => segs[a].startCol - segs[b].startCol || a - b);
  const lanesEnd: number[] = [];
  const result = new Array<number>(segs.length).fill(0);
  for (const i of order) {
    let lane = lanesEnd.findIndex((end) => end < segs[i].startCol);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(segs[i].endCol);
    } else {
      lanesEnd[lane] = segs[i].endCol;
    }
    result[i] = lane;
  }
  return result;
}

/**
 * 每周 7 日各自的溢出数：当日覆盖总任务数 − 可见（lane < maxLanes）任务数。
 * 用于「+N 更多」折叠，保证周行高度有上限。
 */
export function overflowCounts(
  segs: Array<{ startCol: number; endCol: number }>,
  lanes: number[],
  maxLanes: number,
): number[] {
  const out = new Array<number>(7).fill(0);
  for (let c = 0; c < 7; c++) {
    const total = segs.filter((s) => s.startCol <= c && c <= s.endCol).length;
    const shown = segs.filter(
      (s, i) => lanes[i] < maxLanes && s.startCol <= c && c <= s.endCol,
    ).length;
    out[c] = Math.max(0, total - shown);
  }
  return out;
}
