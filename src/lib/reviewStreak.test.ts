import { describe, it, expect } from "vitest";
import { weekIndexOf, nextReviewStreak } from "./reviewStreak";

describe("reviewStreak（周复盘登记）", () => {
  it("weekIndexOf：同一周内的两天序号相同", () => {
    // 2026-09-28 是周一；2026-10-04 是周日（同一周）；10-05 是下一周
    const mon = new Date(2026, 8, 28).getTime();
    const sun = new Date(2026, 9, 4).getTime();
    const nextMon = new Date(2026, 9, 5).getTime();
    expect(weekIndexOf(mon)).toBe(weekIndexOf(sun));
    expect(weekIndexOf(nextMon)).toBe(weekIndexOf(mon) + 1);
  });

  it("首次复盘 → 1；跨周递增；断周归 1；同周保持", () => {
    const wk = 5000;
    expect(nextReviewStreak(null, wk, 0)).toBe(1);
    expect(nextReviewStreak(wk - 1, wk, 3)).toBe(4); // 上周有 → +1
    expect(nextReviewStreak(wk, wk, 3)).toBe(3); // 本周已记 → 保持
    expect(nextReviewStreak(wk - 3, wk, 3)).toBe(1); // 断周 → 重新开始
  });
});
