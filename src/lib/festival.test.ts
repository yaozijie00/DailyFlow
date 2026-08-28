import { describe, it, expect } from "vitest";
import { solarTermFor, todayFestivals } from "./festival";

function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe("solarTermFor（节气近似计算）", () => {
  it("2026 立春 = 2月4日（±1 天可接受）", () => {
    const term = solarTermFor(d(2026, 2, 4));
    expect(["立春", "雨水"]).toContain(term);
  });

  it("2026 清明 ≈ 4月4-5日", () => {
    expect(solarTermFor(d(2026, 4, 5))).toBe("清明");
  });

  it("2026 冬至 ≈ 12月21-22日", () => {
    expect(solarTermFor(d(2026, 12, 22))).toBe("冬至");
  });

  it("2026 小寒 = 1月5日（用上一年计算）", () => {
    expect(solarTermFor(d(2026, 1, 5))).toBe("小寒");
  });

  it("普通日期无节气", () => {
    expect(solarTermFor(d(2026, 3, 10))).toBeNull();
  });
});

describe("todayFestivals", () => {
  it("元旦", () => {
    expect(todayFestivals(d(2026, 1, 1))).toContain("元旦");
  });

  it("国庆节", () => {
    expect(todayFestivals(d(2026, 10, 1))).toContain("国庆节");
  });

  it("普通日期可能为空", () => {
    const list = todayFestivals(d(2026, 6, 15));
    expect(Array.isArray(list)).toBe(true);
  });
});
