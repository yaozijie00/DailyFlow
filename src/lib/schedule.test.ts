import { describe, it, expect } from "vitest";
import { minutesLabel, snapMinutes, minutesToPx, SCHEDULE_START_HOUR, SCHEDULE_ROW_H } from "./schedule";

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
});
