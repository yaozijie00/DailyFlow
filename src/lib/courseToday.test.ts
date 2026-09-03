import { describe, it, expect } from "vitest";
import { weekdayIndexOf, slotsForDate } from "./courseToday";

function slot(id: number, weekday: number, startMinutes: number, title = "数学") {
  return {
    id,
    courseId: 1,
    weekday,
    startMinutes,
    durationMinutes: 90,
    createdAt: 0,
    courseTitle: title,
    categoryColor: null,
  };
}

describe("courseToday（课程表 → 今日）", () => {
  it("weekdayIndexOf：周一=1、周日=7", () => {
    expect(weekdayIndexOf("2026-09-28")).toBe(1); // 周一
    expect(weekdayIndexOf("2026-10-04")).toBe(7); // 周日
    expect(weekdayIndexOf("2026-10-02")).toBe(5); // 周五
  });

  it("slotsForDate：只返回当天且按开始时间排序", () => {
    const slots = [slot(1, 2, 20 * 60), slot(2, 1, 8 * 60), slot(3, 2, 9 * 60)];
    const tue = slotsForDate(slots, "2026-09-29"); // 周二
    expect(tue.map((s) => s.startMinutes)).toEqual([9 * 60, 20 * 60]); // 排序
    const mon = slotsForDate(slots, "2026-09-28");
    expect(mon.map((s) => s.startMinutes)).toEqual([8 * 60]);
    expect(slotsForDate(slots, "2026-09-30")).toHaveLength(0);
  });
});
