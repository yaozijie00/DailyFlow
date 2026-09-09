import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStartupMetrics,
  measureStartupPhase,
  resetStartupMetricsForTests,
  subscribeStartupMetrics,
} from "./startupDiagnostics";

describe("startupDiagnostics", () => {
  afterEach(() => resetStartupMetricsForTests());

  it("返回原操作结果并发布成功耗时", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartupMetrics(listener);

    await expect(measureStartupPhase("database", "本机数据库", async () => 42)).resolves.toBe(42);

    expect(getStartupMetrics()).toEqual([
      expect.objectContaining({ id: "database", label: "本机数据库", status: "ok" }),
    ]);
    expect(getStartupMetrics()[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("记录失败并继续向调用方抛出原异常", async () => {
    const error = new Error("database unavailable");
    await expect(
      measureStartupPhase("database", "本机数据库", async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(getStartupMetrics()[0]).toEqual(
      expect.objectContaining({ id: "database", status: "error" }),
    );
  });
});

