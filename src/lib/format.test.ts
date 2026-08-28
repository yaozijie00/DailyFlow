import { describe, it, expect } from "vitest";
import { formatTimer } from "./format";

describe("formatTimer（mm:ss 倒计时显示）", () => {
  it("25 分钟 → 25:00", () => {
    expect(formatTimer(25 * 60_000)).toBe("25:00");
  });

  it("4 分 32 秒 → 04:32", () => {
    expect(formatTimer(4 * 60_000 + 32_000)).toBe("04:32");
  });

  it("59 秒 → 00:59", () => {
    expect(formatTimer(59_000)).toBe("00:59");
  });

  it("0 → 00:00", () => {
    expect(formatTimer(0)).toBe("00:00");
  });

  it("负数夹取为 00:00", () => {
    expect(formatTimer(-5000)).toBe("00:00");
  });

  it("1 小时 → 60:00（V1 保持 mm:ss）", () => {
    expect(formatTimer(60 * 60_000)).toBe("60:00");
  });

  it("毫秒向下取整：1499ms → 00:01", () => {
    expect(formatTimer(1499)).toBe("00:01");
  });
});
