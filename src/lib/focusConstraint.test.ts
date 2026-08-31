import { describe, it, expect } from "vitest";
import {
  plannedDurationMs,
  remainingFocusMs,
  remainingMinutesLabel,
  clampFocusToRemaining,
} from "./focusConstraint";

function ts(h: number, m = 0): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
}

describe("plannedDurationMs（规划时长）", () => {
  it("优先时间轴 plannedStart/End 之差", () => {
    // 10:00 - 11:30 = 90 分钟
    const r = plannedDurationMs({
      plannedStart: ts(10, 0),
      plannedEnd: ts(11, 30),
      estimatedDuration: 60 * 60,
      actualDuration: 0,
    });
    expect(r).toBe(90 * 60_000);
  });

  it("无时间轴时回退 estimatedDuration（秒 → ms）", () => {
    const r = plannedDurationMs({
      plannedStart: null,
      plannedEnd: null,
      estimatedDuration: 25 * 60,
      actualDuration: 0,
    });
    expect(r).toBe(25 * 60 * 1000);
  });

  it("均无 → null（无约束）", () => {
    const r = plannedDurationMs({
      plannedStart: null,
      plannedEnd: null,
      estimatedDuration: null,
      actualDuration: 0,
    });
    expect(r).toBeNull();
  });
});

describe("remainingFocusMs（剩余可专注时长）", () => {
  it("90min 规划 − 30min 已投入 = 60min", () => {
    const r = remainingFocusMs({
      plannedStart: ts(10, 0),
      plannedEnd: ts(11, 30),
      estimatedDuration: null,
      actualDuration: 30 * 60,
    });
    expect(r).toBe(60 * 60_000);
  });

  it("已投入超过规划 → 负值（仍允许继续但需确认）", () => {
    const r = remainingFocusMs({
      plannedStart: ts(10, 0),
      plannedEnd: ts(11, 0), // 60min
      estimatedDuration: null,
      actualDuration: 65 * 60, // 已投入 65min
    });
    expect(r).toBe(-5 * 60_000);
  });

  it("无规划 → null", () => {
    const r = remainingFocusMs({
      plannedStart: null,
      plannedEnd: null,
      estimatedDuration: null,
      actualDuration: 10,
    });
    expect(r).toBeNull();
  });

  it("多 Pomodoro 累加 actualDuration 后剩余递减", () => {
    // 90min 规划，已做 3 个 25min 番茄 → 剩余 15min
    const r = remainingFocusMs({
      plannedStart: ts(10, 0),
      plannedEnd: ts(11, 30),
      estimatedDuration: null,
      actualDuration: 3 * 25 * 60,
    });
    expect(r).toBe(15 * 60_000);
  });
});

describe("remainingMinutesLabel / clampFocusToRemaining", () => {
  it("剩余分钟展示", () => {
    expect(remainingMinutesLabel(90 * 60_000)).toBe("90 分钟");
    expect(remainingMinutesLabel(60_000)).toBe("1 分钟");
    expect(remainingMinutesLabel(0)).toBe("0 分钟");
    expect(remainingMinutesLabel(-5000)).toBe("0 分钟");
  });

  it("clampFocusToRemaining：剩余小于本次时长 → 夹到剩余（至少 1 分钟）", () => {
    expect(clampFocusToRemaining(25 * 60_000, 15 * 60_000)).toBe(15 * 60_000);
  });

  it("剩余大于等于本次时长 → 保持原时长", () => {
    expect(clampFocusToRemaining(25 * 60_000, 60 * 60_000)).toBe(25 * 60_000);
  });

  it("无约束 → 保持原时长", () => {
    expect(clampFocusToRemaining(25 * 60_000, null)).toBe(25 * 60_000);
  });
});
