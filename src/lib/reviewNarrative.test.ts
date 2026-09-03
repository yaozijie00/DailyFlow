import { describe, it, expect } from "vitest";
import { buildNarrativeLines } from "./reviewNarrative";
import type { NarrativeInput } from "./reviewNarrative";

function base(over: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    label: "本周",
    totalSeconds: 18_000,
    sessionCount: 5,
    completedFocusCount: 3,
    taskCreated: 6,
    taskCompleted: 4,
    estimatedSeconds: 9_000,
    actualSeconds: 12_000,
    underCount: 2,
    underSample: 4,
    avgOverrunSeconds: 900,
    bestHour: 9,
    bestHourSeconds: 6_000,
    topProjectName: "DailyFlow",
    stalledCount: 1,
    ...over,
  };
}

describe("buildNarrativeLines（复盘结论行）", () => {
  it("完整输入生成各结论行", () => {
    const lines = buildNarrativeLines(base());
    expect(lines[0]).toContain("本周专注投入 5 小时");
    expect(lines.some((l) => l.includes("任务：完成 4/6"))).toBe(true);
    expect(lines.some((l) => l.includes("实际超出预计 50 分钟"))).toBe(true);
    expect(lines.some((l) => l.includes("2/4 项任务低估"))).toBe(true);
    expect(lines.some((l) => l.includes("最佳投入时段：09:00–10:00"))).toBe(true);
    expect(lines.some((l) => l.includes("投入最多项目：DailyFlow"))).toBe(true);
    expect(lines.some((l) => l.includes("1 个进行中目标近两周没有完成任务"))).toBe(true);
  });

  it("无任务/无低估时省略相应行", () => {
    const lines = buildNarrativeLines(base({ taskCreated: 0, underSample: 0, underCount: 0, avgOverrunSeconds: 0 }));
    expect(lines.some((l) => l.includes("任务：完成"))).toBe(false);
    expect(lines.some((l) => l.includes("低估"))).toBe(false);
  });

  it("实际=预计输出估算精准", () => {
    const lines = buildNarrativeLines(base({ actualSeconds: 9_000, underCount: 0, underSample: 0 }));
    expect(lines.some((l) => l.includes("估算精准"))).toBe(true);
  });

  it("无数据时只输出投入行为", () => {
    const lines = buildNarrativeLines(base({ totalSeconds: 0, sessionCount: 0, completedFocusCount: 0, taskCreated: 0, taskCompleted: 0, estimatedSeconds: 0, actualSeconds: 0, underCount: 0, underSample: 0, avgOverrunSeconds: 0, bestHour: -1, bestHourSeconds: 0, topProjectName: null, stalledCount: 0 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("专注投入 0 分钟");
  });
});
