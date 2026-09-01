import { describe, it, expect } from "vitest";
import {
  buildMonthGrid,
  monthLabel,
  spanInGrid,
  shiftDateRange,
  dateKey,
} from "./monthView";

describe("buildMonthGrid", () => {
  it("2026年9月：周一为首，首尾补齐整周，含 30 天", () => {
    const cells = buildMonthGrid(2026, 8);
    expect(cells.length % 7).toBe(0);
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth.length).toBe(30);
    expect(inMonth[0].date).toBe("2026-09-01");
    expect(inMonth[29].date).toBe("2026-09-30");
    // 2026-09-01 是周二（getDay()=2）→ 周一补位 1 天
    expect(new Date(2026, 8, 1).getDay()).toBe(2);
    expect(cells[0].date).toBe("2026-08-31");
    expect(cells[0].inMonth).toBe(false);
  });
});

describe("monthLabel / dateKey", () => {
  it("monthLabel 输出「YYYY年M月」", () => {
    expect(monthLabel(2026, 8)).toBe("2026年9月");
  });
  it("dateKey 输出本地 YYYY-MM-DD", () => {
    expect(dateKey(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});

describe("spanInGrid（任务块跨度）", () => {
  const cells = buildMonthGrid(2026, 8); // 2026-09

  it("完全在月内", () => {
    const s = spanInGrid("2026-09-05", "2026-09-20", cells);
    expect(s).not.toBeNull();
    expect(cells[s!.startIndex].date).toBe("2026-09-05");
    expect(cells[s!.endIndex].date).toBe("2026-09-20");
  });

  it("跨月任务：夹取到网格边界（含首尾补位单元格）", () => {
    const s = spanInGrid("2026-08-25", "2026-10-20", cells);
    expect(s).not.toBeNull();
    expect(s!.startIndex).toBe(0);
    expect(s!.endIndex).toBe(cells.length - 1);
  });

  it("与本月无交集返回 null", () => {
    expect(spanInGrid("2026-07-01", "2026-07-10", cells)).toBeNull();
  });

  it("无日期范围返回 null", () => {
    expect(spanInGrid(null, "2026-09-10", cells)).toBeNull();
  });
});

describe("shiftDateRange（整体平移）", () => {
  it("平移 +5 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", 5)).toEqual({
      startDate: "2026-09-10",
      endDate: "2026-09-25",
    });
  });
  it("平移 -3 天", () => {
    expect(shiftDateRange("2026-09-05", "2026-09-20", -3)).toEqual({
      startDate: "2026-09-02",
      endDate: "2026-09-17",
    });
  });
  it("无日期范围返回 null", () => {
    expect(shiftDateRange(null, "2026-09-20", 1)).toBeNull();
  });
});
