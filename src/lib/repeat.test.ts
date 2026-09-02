import { describe, it, expect } from "vitest";
import { nextOccurrenceDate, isRepeatRule, REPEAT_RULES } from "./repeat";

describe("nextOccurrenceDate（重复任务下一次日期）", () => {
  it("空规则/非法规则返回 null", () => {
    expect(nextOccurrenceDate("2026-09-28", "")).toBeNull();
    expect(nextOccurrenceDate("2026-09-28", "bad")).toBeNull();
    expect(nextOccurrenceDate("bad", "daily")).toBeNull();
  });

  it("daily：次日（含跨年）", () => {
    expect(nextOccurrenceDate("2026-09-28", "daily")).toBe("2026-09-29");
    expect(nextOccurrenceDate("2026-12-31", "daily")).toBe("2027-01-01");
  });

  it("weekdays：跳过周末", () => {
    // 2026-10-02 周五 → 10-05 周一
    expect(nextOccurrenceDate("2026-10-02", "weekdays")).toBe("2026-10-05");
    // 2026-10-03 周六 → 10-05
    expect(nextOccurrenceDate("2026-10-03", "weekdays")).toBe("2026-10-05");
    // 2026-10-04 周日 → 10-05
    expect(nextOccurrenceDate("2026-10-04", "weekdays")).toBe("2026-10-05");
    // 周三 → 周四
    expect(nextOccurrenceDate("2026-09-30", "weekdays")).toBe("2026-10-01");
  });

  it("weekly：+7 天", () => {
    expect(nextOccurrenceDate("2026-09-28", "weekly")).toBe("2026-10-05");
  });

  it("monthly：下月同日（月末钳制，闰年正确）", () => {
    expect(nextOccurrenceDate("2026-10-15", "monthly")).toBe("2026-11-15");
    // 1/31 → 平年 2/28
    expect(nextOccurrenceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    // 1/31 → 闰年 2/29
    expect(nextOccurrenceDate("2028-01-31", "monthly")).toBe("2028-02-29");
    // 12/15 → 次年 1/15
    expect(nextOccurrenceDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });

  it("isRepeatRule / 选项常量", () => {
    expect(isRepeatRule("daily")).toBe(true);
    expect(isRepeatRule("")).toBe(true);
    expect(isRepeatRule("monthly")).toBe(true);
    expect(isRepeatRule("fortnightly")).toBe(false);
    expect(REPEAT_RULES.map((r) => r.value)).toEqual(["", "daily", "weekdays", "weekly", "monthly"]);
  });
});
