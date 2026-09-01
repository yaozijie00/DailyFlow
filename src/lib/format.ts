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

/** 把时间戳格式化为本地日期时间，如 2026-08-27 09:30。 */
export function formatDateTime(ms: number | null): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
}

/** 把「秒」格式化为紧凑时长，如 25m / 1h 20m / 3h（统计图表用）。 */
export function formatDurationCompact(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 格式化成就进度「current / target」，按单位选择展示（分钟→紧凑时长、天→天、其他→整数）。 */
export function formatProgress(
  current: number,
  target: number,
  unit: "count" | "minutes" | "days",
): string {
  switch (unit) {
    case "minutes":
      return `${formatDurationCompact(current * 60)} / ${formatDurationCompact(target * 60)}`;
    case "days":
      return `${Math.round(current)} / ${target} 天`;
    default:
      return `${Math.round(current)} / ${target}`;
  }
}

/**
 * 解析专注时长输入（分钟）：合法范围 15-120 返回整数（四舍五入），
 * 非法（非数字 / 越界）返回 null（调用方保持原设置，不保存）。
 */
export function parseDurationMinutes(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 15 || n > 120) return null;
  return Math.round(n);
}
