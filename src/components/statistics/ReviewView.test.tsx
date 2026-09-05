// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { highlightNumbers } from "./ReviewView";

afterEach(cleanup);

function strongTexts(nodes: React.ReactNode[]): string[] {
  return Array.from(render(<span>{nodes}</span>).container.querySelectorAll("span.font-semibold")).map(
    (s) => s.textContent ?? "",
  );
}
function fullText(nodes: React.ReactNode[]): string {
  return render(<span>{nodes}</span>).container.textContent ?? "";
}

describe("highlightNumbers（复盘叙述数字高亮）", () => {
  it("数字高亮、单位保留原文且不重复", () => {
    const out = highlightNumbers("本周专注投入 2 小时 30 分钟，共 8 次");
    expect(fullText(out)).toBe("本周专注投入 2 小时 30 分钟，共 8 次");
    expect(strongTexts(out)).toEqual(["2", "30", "8"]);
  });

  it("百分比数字高亮", () => {
    const out = highlightNumbers("完成率 75%（完成 3/4）");
    expect(fullText(out)).toBe("完成率 75%（完成 3/4）");
    expect(strongTexts(out)).toEqual(["75"]);
  });

  it("HH:MM 时间段数字不高亮（09:00–10:00）", () => {
    const out = highlightNumbers("最佳投入时段：09:00–10:00，投入 1 小时");
    expect(fullText(out)).toBe("最佳投入时段：09:00–10:00，投入 1 小时");
    expect(strongTexts(out)).toEqual(["1"]);
  });

  it("日期 2026-09-05 数字不高亮", () => {
    const out = highlightNumbers("统计截止 2026-09-05");
    expect(strongTexts(out)).toEqual([]);
  });

  it("分子式 3/4 整体不高亮（前后被 / 隔离）", () => {
    const out = highlightNumbers("完成 3/4 项");
    expect(strongTexts(out)).toEqual([]);
  });
});
