/**
 * v2.0 周复盘登记（settings 键 + 纯计算）：
 * - REVIEW_STREAK_KEY / REVIEW_LAST_WEEK_KEY 存于 SQLite settings；
 * - 每周（周一起）打开复盘至少一次记一次；连续周递增，中断清零重来。
 */

export const REVIEW_STREAK_KEY = "review_streak";
export const REVIEW_LAST_WEEK_KEY = "review_last_week";

/** 本地时间所在周（周一 0 点起）的稳定周序号。 */
export function weekIndexOf(tsMs: number): number {
  const d = new Date(tsMs);
  const mondayOffset = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  return Math.floor(monday.getTime() / 604_800_000);
}

/** 根据上次复盘周与当前累计推导新 streak：跨周+1、同周保持、断周归 1。 */
export function nextReviewStreak(
  lastWeek: number | null,
  thisWeek: number,
  current: number,
): number {
  if (lastWeek === null) return 1;
  if (lastWeek === thisWeek) return Math.max(1, current);
  return lastWeek === thisWeek - 1 ? current + 1 : 1;
}
