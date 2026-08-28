/**
 * 时间轴（纵向）核心换算：时间 ↔ 像素。
 * 所有 Task Block 定位、当前时间线、以及拖拽逻辑都必须基于这里的函数：
 *   - timeToY(timeMs) → 像素 Y
 *   - yToTime(y)     → 时间戳（今天）
 *
 * 范围与吸附粒度可用 TimelineConfig 配置（设置页可修改），
 * 省略 config 时使用默认值：08:00（顶部）→ 24:00（底部），吸附 15 分钟。
 */

export interface TimelineConfig {
  /** 时间轴开始（当天分钟数，如 08:00 = 480） */
  startMinutes: number;
  /** 时间轴结束（当天分钟数，如 24:00 = 1440） */
  endMinutes: number;
  /** 吸附粒度（分钟） */
  snapMinutes: number;
}

export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  startMinutes: 8 * 60, // 08:00 = 480
  endMinutes: 24 * 60, // 24:00 = 1440
  snapMinutes: 15, // 15 分钟粒度
};

export const PX_PER_MINUTE = 1.5; // 1 分钟 = 1.5px → 1 小时 = 90px

/** 任务块最小渲染高度（px），避免超短任务不可见。 */
export const MIN_BLOCK_HEIGHT = 8;

/** 默认配置下的开始/结束/吸附常量（兼容旧引用）。 */
export const TIMELINE_START_MINUTES = DEFAULT_TIMELINE_CONFIG.startMinutes;
export const TIMELINE_END_MINUTES = DEFAULT_TIMELINE_CONFIG.endMinutes;
export const SNAP_MINUTES = DEFAULT_TIMELINE_CONFIG.snapMinutes;

export const TIMELINE_TOTAL_HEIGHT =
  (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) * PX_PER_MINUTE; // 1440px

/** 时间戳 → 当天「分钟数」（0-1440，本地时区，忽略秒）。 */
function timestampToMinutes(timeMs: number): number {
  const d = new Date(timeMs);
  return d.getHours() * 60 + d.getMinutes();
}

/** 当天「分钟数」→ 今天的对应时间戳（秒归零）。 */
function minutesToTimestamp(minutes: number): number {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  ).getTime();
}

/** 拖拽允许的最大结束分钟数（末尾减一个吸附粒度），避免跨天问题。 */
function maxDragMinutes(config: TimelineConfig): number {
  return config.endMinutes - config.snapMinutes;
}

function clampMinutes(m: number, config: TimelineConfig): number {
  return Math.min(Math.max(m, config.startMinutes), maxDragMinutes(config));
}

/** 分钟数 → 像素 Y。 */
export function minutesToY(
  minutes: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  return (minutes - config.startMinutes) * PX_PER_MINUTE;
}

/** 像素 Y → 分钟数。 */
export function yToMinutes(
  y: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  return config.startMinutes + y / PX_PER_MINUTE;
}

/** 时间戳 → 像素 Y。 */
export function timeToY(
  timeMs: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  return minutesToY(timestampToMinutes(timeMs), config);
}

/** 像素 Y → 时间戳（今天）。 */
export function yToTime(
  y: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  return minutesToTimestamp(yToMinutes(y, config));
}

/** 分钟数 → "HH:mm"。 */
export function formatMinutes(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** 按配置粒度吸附。 */
export function snapMinutes(
  minutes: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  return Math.round(minutes / config.snapMinutes) * config.snapMinutes;
}

export interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

/**
 * 拖拽范围（两个像素 Y）→ 吸附后的时间范围（分钟）。
 * 规则：按配置吸附、自动交换上下、最小一个粒度、不越界。
 */
export function dragRangeToMinutes(
  y1: number,
  y2: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): TimeRange {
  const m1 = snapMinutes(clampMinutes(yToMinutes(y1, config), config), config);
  const m2 = snapMinutes(clampMinutes(yToMinutes(y2, config), config), config);
  let start = Math.min(m1, m2);
  let end = Math.max(m1, m2);
  if (end - start < config.snapMinutes) {
    end = start + config.snapMinutes;
    if (end > maxDragMinutes(config)) {
      start = maxDragMinutes(config) - config.snapMinutes;
      end = maxDragMinutes(config);
    }
  }
  return { startMinutes: start, endMinutes: end };
}

/** 拖拽范围 → 时间戳（今天）。 */
export function dragRangeToTimes(
  y1: number,
  y2: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): { startMs: number; endMs: number } {
  const { startMinutes, endMinutes } = dragRangeToMinutes(y1, y2, config);
  return {
    startMs: minutesToTimestamp(startMinutes),
    endMs: minutesToTimestamp(endMinutes),
  };
}

/** 时间范围 → "HH:mm - HH:mm"。 */
export function formatTimeRange(startMs: number, endMs: number): string {
  const f = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${f(new Date(startMs))} - ${f(new Date(endMs))}`;
}

/** 调整上边缘（plannedStart）：返回新的 plannedStart（ms），按配置吸附且不晚于 end-粒度。 */
export function resizeStartTo(
  newY: number,
  endMs: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  const endMinutes = timestampToMinutes(endMs);
  const maxStart = Math.max(endMinutes - config.snapMinutes, config.startMinutes);
  let start = snapMinutes(clampMinutes(yToMinutes(newY, config), config), config);
  start = Math.min(start, maxStart);
  return minutesToTimestamp(start);
}

/** 调整下边缘（plannedEnd）：返回新的 plannedEnd（ms），按配置吸附且不早于 start+粒度。 */
export function resizeEndTo(
  newY: number,
  startMs: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): number {
  const startMinutes = timestampToMinutes(startMs);
  const minEnd = Math.min(startMinutes + config.snapMinutes, maxDragMinutes(config));
  let end = snapMinutes(clampMinutes(yToMinutes(newY, config), config), config);
  end = Math.max(end, minEnd);
  return minutesToTimestamp(end);
}

/** 拖动任务块整体移动：返回新的 start/end（ms），按配置吸附并保持时长（时长用时间戳差，兼容跨天）。 */
export function moveTaskBy(
  startMs: number,
  endMs: number,
  deltaY: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
): { startMs: number; endMs: number } {
  const startMinutes = timestampToMinutes(startMs);
  const durationMinutes = (endMs - startMs) / 60_000; // 时间戳差，跨天不为负
  const deltaMinutes = deltaY / PX_PER_MINUTE;

  const maxStart = Math.max(
    config.startMinutes,
    maxDragMinutes(config) - durationMinutes,
  );
  let newStartMinutes = snapMinutes(startMinutes + deltaMinutes, config);
  newStartMinutes = Math.min(
    Math.max(newStartMinutes, config.startMinutes),
    maxStart,
  );

  return {
    startMs: minutesToTimestamp(newStartMinutes),
    endMs: minutesToTimestamp(newStartMinutes + durationMinutes),
  };
}

/**
 * 把任务块的原始 Y 范围夹取到时间轴可见区。
 * 完全在范围外（整体在顶部之上 / 底部之下）返回 null（不渲染）；部分越界夹取到边缘。
 */
export function clampBlockY(
  rawTop: number,
  rawBottom: number,
  totalHeight: number,
): { top: number; height: number } | null {
  if (rawBottom <= 0 || rawTop >= totalHeight) return null;
  const top = Math.max(0, rawTop);
  const bottom = Math.min(totalHeight, rawBottom);
  return { top, height: Math.max(bottom - top, MIN_BLOCK_HEIGHT) };
}

export interface TimeSpan {
  id: number;
  startMs: number;
  endMs: number;
}

/** 检测重叠：返回所有与其他任务时间重叠的任务 id 集合（相邻不算重叠）。 */
export function findOverlappingIds(spans: TimeSpan[]): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}
