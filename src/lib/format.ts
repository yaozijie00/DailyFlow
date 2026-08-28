/** 把「秒」格式化为可读时长，如 90分钟 / 1小时30分钟。 */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分钟`;
}

/** 把「毫秒」格式化为 mm:ss 倒计时显示（分钟/秒均补零），如 25:00 / 04:32；负数夹取为 00:00。 */
export function formatTimer(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
