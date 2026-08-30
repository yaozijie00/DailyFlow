import { describe, it, expect } from "vitest";
import { getMonthGrid, daysInMonth, monthLabel, WEEKDAY_LABELS } from "./calendar";
import { dateStringToStart } from "./date";

describe("calendar", () => {
  it("daysInMonth 正确处理闰年", () => {
    expect(daysInMonth(2024, 2)).toBe(29); // 闰年
    expect(daysInMonth(2026, 2)).toBe(28); // 平年
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("monthLabel 返回「2026年8月」", () => {
    expect(monthLabel(2026, 8)).toBe("2026年8月");
  });

  it("getMonthGrid 返回 42 格、周一起始、含前后月补齐", () => {
    const grid = getMonthGrid(2026, 8);
    expect(grid).toHaveLength(42);
    // 首格是周一（相对 8/1）
    expect(WEEKDAY_LABELS).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    // 网格内日期连续 42 天
    for (let i = 1; i < 42; i++) {
      expect(dateStringToStart(grid[i].date) - dateStringToStart(grid[i - 1].date)).toBe(
        86_400_000,
      );
    }
    // 8/1 在网格中且 inMonth
    const aug1 = grid.find((c) => c.date === "2026-08-01");
    expect(aug1?.inMonth).toBe(true);
    // inMonth 数量 = 当月天数
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("跨月：8月网格尾部含 9 月日期", () => {
    const grid = getMonthGrid(2026, 8);
    expect(grid[grid.length - 1].inMonth).toBe(false);
    expect(grid.some((c) => c.date === "2026-09-01")).toBe(true);
  });

  it("跨年：12月网格尾部含次年 1 月日期", () => {
    const grid = getMonthGrid(2026, 12);
    expect(grid.some((c) => c.date === "2027-01-01")).toBe(true);
    expect(grid.some((c) => c.inMonth && c.date === "2026-12-31")).toBe(true);
  });

  it("闰年 2 月网格覆盖完整 29 天", () => {
    const grid = getMonthGrid(2024, 2);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(29);
    expect(grid.some((c) => c.date === "2024-02-29")).toBe(true);
  });
});
