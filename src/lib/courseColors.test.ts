import { describe, it, expect } from "vitest";
import { courseColor } from "./courseColors";
import { CATEGORY_COLORS } from "./categoryColors";

describe("courseColors（课程稳定色）", () => {
  it("同一课程颜色稳定，且落在 12 色调色板内", () => {
    expect(courseColor(3)).toBe(courseColor(3));
    expect(CATEGORY_COLORS).toContain(courseColor(3));
  });

  it("相邻课程颜色不同（循环取色可区分）", () => {
    expect(courseColor(1)).not.toBe(courseColor(2));
    expect(courseColor(5)).not.toBe(courseColor(6));
  });

  it("id 跨一轮后回到同一色（12 色循环）", () => {
    expect(courseColor(1)).toBe(courseColor(13));
    expect(courseColor(7)).toBe(courseColor(19));
  });

  it("非法输入（0 / 负数 / 小数）安全取色", () => {
    expect(courseColor(0)).toBe(CATEGORY_COLORS[0]);
    expect(courseColor(-2)).toBe(CATEGORY_COLORS[0]);
    expect(CATEGORY_COLORS).toContain(courseColor(3.7));
  });
});
