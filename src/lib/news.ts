/**
 * 新闻展示相关纯函数：相对时间、日期分组标签。
 */

/** 时间戳 → 相对时间（刚刚 / n分钟前 / n小时前 / n天前 / 本地日期）。 */
export function formatRelativeTime(ms: number | null): string {
  if (ms == null) return "";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(ms).toLocaleDateString();
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 日期分组标签：今天 / 昨天 / YYYY-MM-DD。 */
export function dateGroupLabel(ms: number): string {
  const key = dateKey(ms);
  const now = new Date();
  if (key === dateKey(now.getTime())) return "今天";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (key === dateKey(yesterday.getTime())) return "昨天";
  return key;
}
