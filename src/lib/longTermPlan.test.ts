import { describe, expect, it } from "vitest";
import {
  calculateCapacity,
  calculatePlanHealth,
  effectiveWeeklyPaceMinutes,
  estimateCompletionDate,
  progressFromEstimatedMinutes,
  plannedProgressAt,
} from "./longTermPlan";

describe("longTermPlan planning helpers", () => {
  it("缺少成果基线时健康状态未知，不把实际进度当作超前", () => {
    expect(calculatePlanHealth({ status: "active", plannedProgress: null, actualProgress: 50 }))
      .toEqual({ state: "unknown", deviationPercent: null });
    expect(calculatePlanHealth({ status: "active", actualProgress: 50 }).state).toBe("unknown");
    expect(calculatePlanHealth({ status: "active", plannedProgress: 50, actualProgress: NaN }).state).toBe("unknown");
    expect(calculatePlanHealth({ status: "paused", plannedProgress: null, actualProgress: 50 }))
      .toEqual({ state: "paused", deviationPercent: null });
  });

  it("时间参考进度拒绝缺失、溢出和倒置日期", () => {
    expect(plannedProgressAt(null, "2026-09-30")).toBeNull();
    expect(plannedProgressAt("2026-02-30", "2026-09-30")).toBeNull();
    expect(plannedProgressAt("2026-09-30", "2026-09-01")).toBeNull();
    expect(plannedProgressAt("2026-09-01", "2026-09-11", new Date(2026, 8, 6))).toBe(50);
  });

  it("未估时任务存在时不会因已估时任务完成而显示全部完成", () => {
    expect(progressFromEstimatedMinutes([
      { status: "COMPLETED", estimatedMinutes: 120 },
      { status: "TODO", estimatedMinutes: null },
    ])).toBe(50);
  });

  it("存在未完成任务时四舍五入也不能显示 100%", () => {
    expect(progressFromEstimatedMinutes([
      ...Array.from({ length: 200 }, () => ({ status: "COMPLETED", estimatedMinutes: 60 })),
      { status: "TODO", estimatedMinutes: null },
    ])).toBe(99);
    expect(progressFromEstimatedMinutes([
      { status: "COMPLETED", estimatedMinutes: 2000 },
      { status: "TODO", estimatedMinutes: 1 },
    ])).toBe(99);
  });

  it("没有剩余估时不等于今天完成，只有明确完成才返回当天", () => {
    expect(estimateCompletionDate("2026-09-10", 0, 360)).toBeNull();
    expect(estimateCompletionDate("2026-09-10", -1, 360)).toBeNull();
    expect(estimateCompletionDate("2026-09-10", 0, 360, { completed: true })).toBe("2026-09-10");
    expect(estimateCompletionDate("2026-02-30", 60, 360)).toBeNull();
    expect(estimateCompletionDate("2026-09-10", NaN, 360)).toBeNull();
    expect(estimateCompletionDate("2026-09-10", 60, Infinity)).toBeNull();
  });
  it("按预计耗时计算任务进度，忽略取消任务", () => {
    expect(
      progressFromEstimatedMinutes([
        { status: "COMPLETED", estimatedMinutes: 120 },
        { status: "TODO", estimatedMinutes: 180 },
        { status: "CANCELLED", estimatedMinutes: 600 },
      ]),
    ).toBe(40);
  });

  it("没有预计耗时时回退到任务完成数", () => {
    expect(
      progressFromEstimatedMinutes([
        { status: "COMPLETED", estimatedMinutes: null },
        { status: "TODO", estimatedMinutes: null },
      ]),
    ).toBe(50);
  });

  it("暂停计划不产生落后告警", () => {
    expect(
      calculatePlanHealth({
        status: "paused",
        plannedProgress: 80,
        actualProgress: 20,
      }),
    ).toEqual({ state: "paused", deviationPercent: -60 });
  });

  it("按进度偏差给出正常、略微落后和严重落后", () => {
    expect(calculatePlanHealth({ status: "active", plannedProgress: 35, actualProgress: 32 }).state).toBe("healthy");
    expect(calculatePlanHealth({ status: "active", plannedProgress: 40, actualProgress: 32 }).state).toBe("slightly_behind");
    expect(calculatePlanHealth({ status: "active", plannedProgress: 60, actualProgress: 32 }).state).toBe("seriously_behind");
  });

  it("根据剩余预计耗时与每周投入估算完成日期", () => {
    expect(estimateCompletionDate("2026-09-10", 720, 360)).toBe("2026-09-24");
    expect(estimateCompletionDate("2026-09-10", 720, 0)).toBeNull();
  });

  it("有稳定实际记录时使用平均周速度，数据不足时回退计划投入", () => {
    expect(effectiveWeeklyPaceMinutes("2026-09-01", 12 * 3600, 600, new Date(2026, 8, 15))).toBe(360);
    expect(effectiveWeeklyPaceMinutes(null, 0, 600, new Date(2026, 8, 15))).toBe(600);
  });

  it("汇总每周容量并按优先级给出减量候选", () => {
    expect(
      calculateCapacity(20 * 60, [
        { id: 1, priority: "p1", weeklyTargetMinutes: 600 },
        { id: 2, priority: "p2", weeklyTargetMinutes: 360 },
        { id: 3, priority: "p3", weeklyTargetMinutes: 480 },
      ]),
    ).toEqual({ requiredMinutes: 1440, capacityMinutes: 1200, overloadMinutes: 240, adjustmentCandidateIds: [3] });
  });
});
