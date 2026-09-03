import { describe, it, expect } from "vitest";
import {
  minutesLabel,
  snapMinutes,
  minutesToPx,
  SCHEDULE_START_HOUR,
  SCHEDULE_ROW_H,
  SCHEDULE_GRID_START_MIN,
  SCHEDULE_GRID_END_MIN,
  spansOverlap,
  isOccupied,
  clampGridStart,
  resizeSlot,
} from "./schedule";

describe("schedule（课程表时间工具）", () => {
  it("minutesLabel", () => {
    expect(minutesLabel(9 * 60 + 5)).toBe("09:05");
    expect(minutesLabel(19 * 60)).toBe("19:00");
    expect(minutesLabel(0)).toBe("00:00");
  });

  it("snapMinutes 15 分钟吸附并夹取", () => {
    expect(snapMinutes(9 * 60 + 17)).toBe(9 * 60 + 15);
    expect(snapMinutes(9 * 60 + 8)).toBe(9 * 60 + 15); // 四舍五入
    expect(snapMinutes(14 * 60 + 45)).toBe(14 * 60 + 45);
    expect(snapMinutes(-5)).toBe(0);
    expect(snapMinutes(1500)).toBe(1439);
  });

  it("minutesToPx 以起始小时为原点", () => {
    expect(minutesToPx(SCHEDULE_START_HOUR * 60)).toBe(0);
    expect(minutesToPx((SCHEDULE_START_HOUR + 1) * 60)).toBe(SCHEDULE_ROW_H);
    expect(minutesToPx(SCHEDULE_START_HOUR * 60 + 30)).toBe(SCHEDULE_ROW_H / 2);
  });

  it("spansOverlap：同星期重叠判定（左闭右开）", () => {
    const base = { weekday: 1, startMinutes: 9 * 60, durationMinutes: 60 };
    expect(spansOverlap(base, { weekday: 1, startMinutes: 9 * 60 + 30, durationMinutes: 30 })).toBe(true); // 部分重叠
    expect(spansOverlap(base, { weekday: 1, startMinutes: 10 * 60, durationMinutes: 30 })).toBe(false); // 首尾相接不重叠
    expect(spansOverlap(base, { weekday: 1, startMinutes: 8 * 60 + 30, durationMinutes: 30 })).toBe(false); // 结束=开始
    expect(spansOverlap(base, { weekday: 1, startMinutes: 8 * 60, durationMinutes: 120 })).toBe(true); // 完全包含
    expect(spansOverlap(base, { weekday: 2, startMinutes: 9 * 60, durationMinutes: 60 })).toBe(false); // 不同星期
  });

  it("isOccupied：目标时段与列表重叠检测（含忽略自身）", () => {
    const spans = [
      { id: 1, weekday: 1, startMinutes: 9 * 60, durationMinutes: 60 },
      { id: 2, weekday: 2, startMinutes: 14 * 60, durationMinutes: 90 },
    ];
    expect(isOccupied(spans, 1, 9 * 60 + 30, 30)).toBe(true); // 部分重叠
    expect(isOccupied(spans, 2, 15 * 60, 30)).toBe(true); // 部分重叠
    expect(isOccupied(spans, 1, 10 * 60, 60)).toBe(false); // 首尾相接不重叠
    expect(isOccupied(spans, 1, 8 * 60, 60)).toBe(false);
    expect(isOccupied(spans, 3, 9 * 60, 60)).toBe(false);
    // 块自身拖拽：重叠自己不算冲突
    expect(isOccupied(spans, 1, 9 * 60, 60, 1)).toBe(false);
    expect(isOccupied(spans, 2, 14 * 60, 90, 2)).toBe(false);
    expect(isOccupied(spans, 2, 14 * 60, 90, 1)).toBe(true);
  });

  it("clampGridStart：开始分钟夹取到可视窗内且整块可见", () => {
    expect(clampGridStart(9 * 60, 60)).toBe(9 * 60);
    // 早于 08:00 → 拉回 08:00
    expect(clampGridStart(7 * 60, 60)).toBe(SCHEDULE_GRID_START_MIN);
    // 晚到放不下（22:00 后结束）→ 提前到 22:00-duration
    expect(clampGridStart(22 * 60, 60)).toBe(SCHEDULE_GRID_END_MIN - 60);
    expect(clampGridStart(21 * 60, 120)).toBe(SCHEDULE_GRID_END_MIN - 120);
  });

  it("resizeSlot：拖上边缘改开始、结束不动，最短 30 分钟", () => {
    const r1 = resizeSlot(9 * 60, 60, "start", 9 * 60 + 15); // 晚 15 分钟开始 → 时长 45
    expect(r1).toEqual({ startMinutes: 9 * 60 + 15, durationMinutes: 45 });
    const r2 = resizeSlot(9 * 60, 60, "start", 7 * 60 + 30); // 早于窗 → 08:00，时长拉长到 120
    expect(r2).toEqual({ startMinutes: 8 * 60, durationMinutes: 120 });
    const r3 = resizeSlot(9 * 60, 60, "start", 9 * 60 + 55); // 少于 30 分钟 → 压到 end-30
    expect(r3).toEqual({ startMinutes: 9 * 60 + 30, durationMinutes: 30 });
  });

  it("resizeSlot：拖下边缘改结束，最短 30 分钟且不超 22:00", () => {
    const r1 = resizeSlot(9 * 60, 60, "end", 11 * 60); // 加长到 2 小时
    expect(r1).toEqual({ startMinutes: 9 * 60, durationMinutes: 120 });
    const r2 = resizeSlot(9 * 60, 60, "end", 9 * 60 + 15); // 少于 30 → 压到 30
    expect(r2).toEqual({ startMinutes: 9 * 60, durationMinutes: 30 });
    const r3 = resizeSlot(9 * 60, 60, "end", 23 * 60); // 超窗 → 22:00
    expect(r3).toEqual({ startMinutes: 9 * 60, durationMinutes: SCHEDULE_GRID_END_MIN - 9 * 60 });
  });
});
