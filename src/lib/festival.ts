/**
 * 今日节日：固定日期节日 + 二十四节气（公式近似计算，离线可用）。
 * 说明：农历节日（春节/中秋/端午等）需农历换算，暂不包含；清明为节气之一，已覆盖。
 */

/** 二十四节气名称（立春 → 大寒）。 */
const SOLAR_TERMS = [
  "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑",
  "立秋", "处暑", "白露", "秋分", "寒露", "霜降",
  "立冬", "小雪", "大雪", "冬至", "小寒", "大寒",
];

/** 各节气所在月份（下标与 SOLAR_TERMS 对应）。 */
const TERM_MONTH = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 1, 1];

/** 21 世纪各节气基准常数 C（近似公式，误差约 ±1 天）。 */
const TERM_C = [
  4.6295, 19.4599, 6.3826, 21.4155, 5.59, 20.888,
  6.318, 21.86, 6.5, 22.2, 7.928, 23.65,
  8.35, 23.95, 8.44, 23.822, 9.098, 24.218,
  8.218, 23.08, 7.9, 22.6, 5.4055, 20.12,
];

/** 若 date 当天是节气，返回节气名；否则 null。 */
export function solarTermFor(date: Date): string | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (let i = 0; i < SOLAR_TERMS.length; i++) {
    // 1 月节气（小寒/大寒）用上一年；其余用本年（公式基于世纪内年份）
    const y2 = TERM_MONTH[i] === 1 ? (year - 1) % 100 : year % 100;
    const termDay = Math.floor(y2 * 0.2422 + TERM_C[i]) - Math.floor((y2 - 1) / 4);
    if (TERM_MONTH[i] === month && termDay === day) return SOLAR_TERMS[i];
  }
  return null;
}

/** 固定日期节日（月-日 → 名称）。 */
const FIXED_FESTIVALS: Record<string, string[]> = {
  "1-1": ["元旦"],
  "2-14": ["情人节"],
  "3-8": ["妇女节"],
  "3-12": ["植树节"],
  "4-1": ["愚人节"],
  "5-1": ["劳动节"],
  "5-4": ["青年节"],
  "6-1": ["儿童节"],
  "7-1": ["建党节"],
  "8-1": ["建军节"],
  "9-10": ["教师节"],
  "10-1": ["国庆节"],
  "12-25": ["圣诞节"],
};

/** 今天的节日（固定节日 + 当日节气），可能为空数组。 */
export function todayFestivals(date: Date): string[] {
  const term = solarTermFor(date);
  const fixed = FIXED_FESTIVALS[`${date.getMonth() + 1}-${date.getDate()}`] ?? [];
  return [...fixed, ...(term ? [term] : [])];
}
