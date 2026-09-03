import { dateKey, parseDateKey } from "./monthView";

/**
 * 任务延期目标日期（v1.7 Postpone）：
 * - tomorrow：明天
 * - weekend：最近的周六/周日（严格晚于今天；周五→周六，周六→周日，周日→下周六）
 * - nextWeek：下周一（今天周一→+7，其余→最近的周一）
 * 纯函数，无 UI 依赖。
 */

export interface PostponeTargets {
  tomorrow: string;
  weekend: string;
  nextWeek: string;
}

function shift(ymd: string, n: number): string {
  const d = parseDateKey(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function postponeTargets(today: string): PostponeTargets {
  const tomorrow = shift(today, 1);

  // weekend：从明天起找第一个周六(6)/周日(0)
  let weekend = tomorrow;
  for (let i = 1; i <= 7; i++) {
    const d = parseDateKey(shift(today, i));
    if (d && (d.getDay() === 0 || d.getDay() === 6)) {
      weekend = dateKey(d);
      break;
    }
  }

  // nextWeek：下一个周一(1)，严格晚于今天
  let nextWeek = tomorrow;
  for (let i = 1; i <= 7; i++) {
    const d = parseDateKey(shift(today, i));
    if (d && d.getDay() === 1) {
      nextWeek = dateKey(d);
      break;
    }
  }

  return { tomorrow, weekend, nextWeek };
}
