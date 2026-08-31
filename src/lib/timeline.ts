/**
 * 时间轴（纵向）核心换算：时间 ↔ 像素。
 * 坐标系：Y 为「当天 00:00 起的绝对像素」，时间轴范围 = 全天 00:00-24:00（1440 分钟）。
 * 用户设定的开始/结束范围（config.startMinutes/endMinutes）只用于「视觉强调 + 分割线」，
 * 不参与坐标换算与任务钳制（任务可排在全天任意时间）。
 * 缩放：pxPerMinute（每像素分钟数，设置项，默认 1.5）。
 *
 * 所有 Task Block 定位、当前时间线、以及拖拽逻辑都必须基于这里的函数：
 *   - timeToY(timeMs, pxPerMinute) → 像素 Y
 *   - yToTime(y, pxPerMinute)     → 时间戳（今天）
 */

export interface TimelineConfig {
  /** 时间轴开始（当天分钟数，如 08:00 = 480）——视觉强调范围 */
  startMinutes: number;
  /** 时间轴结束（当天分钟数，如 24:00 = 1440）——视觉强调范围 */
  endMinutes: number;
  /** 吸附粒度（分钟） */
  snapMinutes: number;
}

export const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
  startMinutes: 8 * 60, // 08:00 = 480
  endMinutes: 24 * 60, // 24:00 = 1440
  snapMinutes: 15, // 15 分钟粒度
};

export const PX_PER_MINUTE = 1.5; // 默认 1 分钟 = 1.5px → 1 小时 = 90px

/** 全天分钟数（00:00-24:00）。 */
export const FULL_DAY_MINUTES = 24 * 60;

/** 任务块最小渲染高度（px），避免超短任务不可见。 */
export const MIN_BLOCK_HEIGHT = 8;

/** 全天总高度（默认缩放）。 */
export const TIMELINE_TOTAL_HEIGHT = FULL_DAY_MINUTES * PX_PER_MINUTE; // 2160px

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

/** 全天范围内钳制分钟数（0-1440）。 */
function clampMinutes(m: number): number {
  return Math.min(Math.max(m, 0), FULL_DAY_MINUTES);
}

/** 分钟数 → 像素 Y（全天绝对坐标）。 */
export function minutesToY(minutes: number, pxPerMinute: number = PX_PER_MINUTE): number {
  return minutes * pxPerMinute;
}

/** 像素 Y → 分钟数（全天绝对坐标）。 */
export function yToMinutes(y: number, pxPerMinute: number = PX_PER_MINUTE): number {
  return y / pxPerMinute;
}

/** 时间戳 → 像素 Y。 */
export function timeToY(timeMs: number, pxPerMinute: number = PX_PER_MINUTE): number {
  return minutesToY(timestampToMinutes(timeMs), pxPerMinute);
}

/** 像素 Y → 时间戳（今天）。 */
export function yToTime(y: number, pxPerMinute: number = PX_PER_MINUTE): number {
  return minutesToTimestamp(yToMinutes(y, pxPerMinute));
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
 * 规则：按配置吸附、自动交换上下、最小一个粒度、全天范围内不越界。
 */
export function dragRangeToMinutes(
  y1: number,
  y2: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
  pxPerMinute: number = PX_PER_MINUTE,
): TimeRange {
  const m1 = snapMinutes(clampMinutes(yToMinutes(y1, pxPerMinute)), config);
  const m2 = snapMinutes(clampMinutes(yToMinutes(y2, pxPerMinute)), config);
  let start = Math.min(m1, m2);
  let end = Math.max(m1, m2);
  if (end - start < config.snapMinutes) {
    end = start + config.snapMinutes;
    if (end > FULL_DAY_MINUTES) {
      start = FULL_DAY_MINUTES - config.snapMinutes;
      end = FULL_DAY_MINUTES;
    }
  }
  return { startMinutes: start, endMinutes: end };
}

/** 拖拽范围 → 时间戳（今天）。 */
export function dragRangeToTimes(
  y1: number,
  y2: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
  pxPerMinute: number = PX_PER_MINUTE,
): { startMs: number; endMs: number } {
  const { startMinutes, endMinutes } = dragRangeToMinutes(y1, y2, config, pxPerMinute);
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
  pxPerMinute: number = PX_PER_MINUTE,
): number {
  const endMinutes = timestampToMinutes(endMs);
  const maxStart = Math.max(endMinutes - config.snapMinutes, 0);
  let start = snapMinutes(clampMinutes(yToMinutes(newY, pxPerMinute)), config);
  start = Math.min(start, maxStart);
  return minutesToTimestamp(start);
}

/** 调整下边缘（plannedEnd）：返回新的 plannedEnd（ms），按配置吸附且不早于 start+粒度。 */
export function resizeEndTo(
  newY: number,
  startMs: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
  pxPerMinute: number = PX_PER_MINUTE,
): number {
  const startMinutes = timestampToMinutes(startMs);
  const minEnd = Math.min(startMinutes + config.snapMinutes, FULL_DAY_MINUTES);
  let end = snapMinutes(clampMinutes(yToMinutes(newY, pxPerMinute)), config);
  end = Math.max(end, minEnd);
  return minutesToTimestamp(end);
}

/** 拖动任务块整体移动：返回新的 start/end（ms），按配置吸附并保持时长（时长用时间戳差，兼容跨天）。 */
export function moveTaskBy(
  startMs: number,
  endMs: number,
  deltaY: number,
  config: TimelineConfig = DEFAULT_TIMELINE_CONFIG,
  pxPerMinute: number = PX_PER_MINUTE,
): { startMs: number; endMs: number } {
  const startMinutes = timestampToMinutes(startMs);
  const durationMinutes = (endMs - startMs) / 60_000; // 时间戳差，跨天不为负
  const deltaMinutes = deltaY / pxPerMinute;

  const maxStart = Math.max(0, FULL_DAY_MINUTES - durationMinutes);
  let newStartMinutes = snapMinutes(startMinutes + deltaMinutes, config);
  newStartMinutes = Math.min(Math.max(newStartMinutes, 0), maxStart);

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

export interface LaneLayout {
  /** 1-based 栏号 */
  lane: number;
  /** 所在重叠组的栏数（1 = 全宽） */
  laneCount: number;
}

/**
 * 重叠任务分栏（甘特式）：
 * - 以「时间重叠为边」找连通组（并查集）；
 * - 组内按开始时间贪心分配栏位（区间图着色，栏数最优）；
 * - prefer：可选，返回某任务「偏好栏位」（0-based），偏好栏空闲则优先使用（用户横向换栏）；
 * - 无重叠的任务不在返回的 Map 中（渲染时保持全宽）。
 */
export function computeLanes(
  spans: TimeSpan[],
  prefer?: (id: number) => number | undefined,
): Map<number, LaneLayout> {
  const n = spans.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.startMs < b.endMs && b.startMs < a.endMs) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }
  /** 第一个「末尾时间已结束」的空闲栏；无则新开一栏。 */
  const firstFreeLane = (laneEnd: number[], start: number): number => {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] > start) lane++;
    return lane;
  };
  const result = new Map<number, LaneLayout>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue; // 单任务组 → 全宽
    const sorted = [...idxs].sort((x, y) => spans[x].startMs - spans[y].startMs);
    const laneEnd: number[] = [];
    const assigned: { idx: number; lane: number }[] = [];
    for (const idx of sorted) {
      const p = prefer ? prefer(spans[idx].id) : undefined;
      let lane: number;
      if (p !== undefined && p >= 0) {
        while (laneEnd.length <= p) laneEnd.push(-Infinity); // 空栏视为空闲
        if (laneEnd[p] <= spans[idx].startMs) {
          lane = p; // 偏好栏空闲 → 使用
        } else {
          lane = firstFreeLane(laneEnd, spans[idx].startMs); // 偏好被占用 → 贪心回退
        }
      } else {
        lane = firstFreeLane(laneEnd, spans[idx].startMs);
      }
      laneEnd[lane] = spans[idx].endMs;
      assigned.push({ idx, lane: lane + 1 });
    }
    const laneCount = assigned.reduce((m, a) => Math.max(m, a.lane), 0);
    for (const { idx, lane } of assigned) {
      result.set(spans[idx].id, { lane, laneCount });
    }
  }
  return result;
}

// ---------------- Task Block 显示分级 ----------------

/** 块高达到该值（px）时显示开始-结束时间。 */
export const BLOCK_TIME_MIN = 26;
/** 块高达到该值（px）时额外显示任务描述。 */
export const BLOCK_NOTES_MIN = 52;

export interface BlockInfoLevel {
  showTime: boolean;
  showNotes: boolean;
}

/**
 * 按任务块可用高度决定显示哪些信息（由小到大：标题 → 时间 → 描述），
 * 避免文字溢出。高度用「夹取后的渲染高度」。
 */
export function blockInfoLevel(height: number): BlockInfoLevel {
  return {
    showTime: height >= BLOCK_TIME_MIN,
    showNotes: height >= BLOCK_NOTES_MIN,
  };
}

/** 任务块视觉状态：normal / running / completed / cancelled（按 Task.status）。 */
export type TaskBlockState = "normal" | "running" | "completed" | "cancelled";

export function taskBlockState(status: string): TaskBlockState {
  switch (status) {
    case "IN_PROGRESS":
      return "running";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "normal";
  }
}
