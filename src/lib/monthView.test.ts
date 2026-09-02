import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  monthDays,
  monthLabel,
  dateKey,
  daySpanInMonth,
  shiftDateRange,
  weekdayOf,
} from "./monthView";

describe("daysInMonth（动态天数，不硬编码）", () => {
  it("2026 年 9 月 30 天", () => {
    expect(daysInMonth(2026, 8)).toBe(30);
  });
  it("2026 年 10 月 31 天", () => {
    expect(daysInMonth(2026, 9)).toBe(31);
  });
  it("平年 2 月 28 天、闰年 2 月 29 天", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2024, 1)).toBe(29);
  });
  it("跨年月份正常", () => {
    expect(daysInMonth(2026, 11)).toBe(31); // 2026-12
    expect(daysInMonth(2027, 0)).toBe(31); // 2027-01
  });
});

describe("monthDays（月度日时间轴：每月每天一列）", () => {
  it("2026 年 9 月生成 1..30 共 30 个日期列（非 7 列）", () => {
    const days = monthDays(2026, 8);
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: "2026-09-01", day: 1 });
    expect(days[29]).toMatchObject({ date: "2026-09-30", day: 30 });
  });

  it("每天带星期标注；2026-09-01 为周二", () => {
    const days = monthDays(2026, 8);
    expect(days[0].weekday).toBe("周二");
    expect(days[2].weekday).toBe("周四");
  });

  it("今天高亮标记", () => {
    const days = monthDays(2026, 8, "2026-09-02");
    expect(days.find((d) => d.isToday)?.day).toBe(2);
  });

  it("weekdayOf：2026-09-05 周六 / 09-06 周日", () => {
    expect(weekdayOf("2026-09-05")).toBe("周六");
    expect(weekdayOf("2026-09-06")).toBe("周日");
  });
});

describe("daySpanInMonth（任务块日跨度 + 跨月裁剪）", () => {
  it("完全在月内：3～8 → {start:3,end:8}", () => {
    expect(daySpanInMonth("2026-09-03", "2026-09-08", 2026, 8)).toEqual({ start: 3, end: 8 });
  });
  it("跨月任务：8/25～9/10 → 裁剪为 1～10", () => {
    expect(daySpanInMonth("2026-08-25", "2026-09-10", 2026, 8)).toEqual({ start: 1, end: 10 });
  });
  it("跨月任务：9/25～10/05 → 裁剪为 25～30", () => {
    expect(daySpanInMonth("2026-09-25", "2026-10-05", 2026, 8)).toEqual({ start: 25, end: 30 });
  });
  it("与本月无交集返回 null", () => {
    expect(daySpanInMonth("2026-07-01", "2026-07-10", 2026, 8)).toBeNull();
    expect(daySpanInMonth("2026-11-01", "2026-11-30", 2026, 8)).toBeNull();
  });
  it("无日期范围返回 null", () => {
    expect(daySpanInMonth(null, "2026-09-10", 2026, 8)).toBeNull();
  });
});

describe("shiftDateRange（日级平移）", () => {
  it("+5 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", 5)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-25",
    });
  });
  it("-3 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", -3)).toEqual({
      startDate: "2026-09-02",
      endDate: "2026-09-17",
    });
  });
  it("跨月平移", () => {
    expect(shiftDateRange("2026-09-29", "2026-10-02", 3)).toEqual({
      startDate: "2026-10-02",
      endDate: "2026-10-05",
    });
  });
});

describe("monthLabel / dateKey", () => {
  it("monthLabel", () => {
    expect(monthLabel(2026, 8)).toBe("2026年9月");
  });
  it("dateKey", () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});
