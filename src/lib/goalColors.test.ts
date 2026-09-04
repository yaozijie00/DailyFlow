import { describe, it, expect } from "vitest";
import { goalColor } from "./goalColors";
import { courseColor } from "./courseColors";
import { CATEGORY_COLORS } from "./categoryColors";

describe("goalColors（长期目标稳定色）", () => {
  it("同一目标颜色稳定且在调色板内", () => {
    expect(goalColor(2)).toBe(goalColor(2));
    expect(CATEGORY_COLORS).toContain(goalColor(2));
  });

  it("相邻目标颜色不同", () => {
    expect(goalColor(1)).not.toBe(goalColor(2));
  });

  it("id 跨一轮后回到同一色（12 色循环）", () => {
    expect(goalColor(1)).toBe(goalColor(13));
  });

  it("与课程表取色公式一致（同一 12 色语言）", () => {
    expect(goalColor(5)).toBe(courseColor(5));
  });
});
