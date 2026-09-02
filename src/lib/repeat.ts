import { dateKey, parseDateKey } from "./monthView";

/**
 * 重复任务规则（v1.6.2 V1）：
 * - '' 不重复；daily 每天；weekdays 工作日（周一~五）；weekly 每周；monthly 每月同日。
 * - nextOccurrenceDate 返回「严格晚于给定日期」的下一次日期（纯函数，可单测）。
 * 说明：生成逻辑在 TaskService 完成时触发（与完成合并为一次撤销）。
 */

export type RepeatRule = "" | "daily" | "weekdays" | "weekly" | "monthly";

export const REPEAT_RULES: { value: RepeatRule; label: string }[] = [
  { value: "", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekdays", label: "工作日（周一至五）" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月同日" },
];

export function isRepeatRule(v: string): v is RepeatRule {
  return v === "" || v === "daily" || v === "weekdays" || v === "weekly" || v === "monthly";
}

/** 下一次出现日期；无规则/非法返回 null。 */
export function nextOccurrenceDate(dateStr: string, rule: string): string | null {
  if (!isRepeatRule(rule) || rule === "") return null;
  const d = parseDateKey(dateStr);
  if (!d) return null;
  switch (rule) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return dateKey(d);
    case "weekdays": {
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      return dateKey(d);
    }
    case "weekly":
      d.setDate(d.getDate() + 7);
      return dateKey(d);
    case "monthly": {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return dateKey(d);
    }
  }
}
