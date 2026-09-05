import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../db/test-helpers";
import type { Db } from "../../db/db";
import { WorkflowMetricsRepository } from "./workflowMetricsRepository";
import { WorkflowRepository } from "../../extensions/builtin/workflow/repository/workflowRepository";

describe("WorkflowMetricsRepository（A6 Analytics）", () => {
  let db: Db;
  let close: () => void;
  let wfRepo: WorkflowRepository;
  let metrics: WorkflowMetricsRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    wfRepo = new WorkflowRepository(db);
    metrics = new WorkflowMetricsRepository(db);
  });

  afterEach(() => close());

  async function finishRun(wfId: string, completedAt: number, startedAt: number, state: "completed" | "failed" | "cancelled") {
    const run = await wfRepo.createRun(wfId);
    await wfRepo.updateRun(run.id, { state: "running", startedAt });
    await wfRepo.updateRun(run.id, { state, completedAt });
    return run;
  }

  it("聚合区间内 completed/failed run 数与平均时长", async () => {
    const wfA = await wfRepo.create({ name: "石材流程" });
    const wfB = await wfRepo.create({ name: "建模流程" });
    // 区间 [1000, 5000)
    await finishRun(wfA.id, 2000, 1000, "completed"); // 时长 1000ms
    await finishRun(wfA.id, 3000, 2000, "completed"); // 时长 1000ms
    await finishRun(wfB.id, 4000, 1000, "failed");
    await finishRun(wfA.id, 9000, 8000, "completed"); // 区间外（completedAt 9000）

    const agg = await metrics.aggregateInRange(1000, 5000);
    expect(agg.completedRuns).toBe(2);
    expect(agg.failedRuns).toBe(1);
    expect(agg.avgRunSeconds).toBe(1); // 1000ms → 1s
    expect(agg.topWorkflow).toBe("石材流程"); // 完成 2 次
  });

  it("空区间返回全 0 与 null top", async () => {
    const agg = await metrics.aggregateInRange(0, 1);
    expect(agg.completedRuns).toBe(0);
    expect(agg.failedRuns).toBe(0);
    expect(agg.avgRunSeconds).toBe(0);
    expect(agg.topWorkflow).toBeNull();
  });

  it("cancelled 不计数", async () => {
    const wf = await wfRepo.create({ name: "X" });
    await finishRun(wf.id, 2000, 1000, "cancelled");
    const agg = await metrics.aggregateInRange(0, 5000);
    expect(agg.completedRuns).toBe(0);
    expect(agg.failedRuns).toBe(0);
  });
});
