import { describe, it, expect } from "vitest";
import {
  TASK_PRIORITIES,
  DEFAULT_TASK_PRIORITY,
  taskPriorityMeta,
  isTaskPriority,
  taskPriorityOrder,
} from "./taskPriority";

describe("taskPriority（任务优先级元信息）", () => {
  it("三档：高/中/低，排序权重递减", () => {
    expect(TASK_PRIORITIES.map((p) => p.value)).toEqual(["high", "medium", "low"]);
    expect(taskPriorityOrder("high")).toBeLessThan(taskPriorityOrder("medium"));
    expect(taskPriorityOrder("medium")).toBeLessThan(taskPriorityOrder("low"));
  });

  it("标签与颜色齐全", () => {
    expect(taskPriorityMeta("high").label).toBe("高");
    expect(taskPriorityMeta("medium").label).toBe("中");
    expect(taskPriorityMeta("low").label).toBe("低");
    expect(taskPriorityMeta("high").text).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("缺失/非法值回退默认「中」", () => {
    expect(taskPriorityMeta(undefined).value).toBe(DEFAULT_TASK_PRIORITY);
    expect(taskPriorityMeta(null).value).toBe("medium");
    expect(taskPriorityMeta("urgent").value).toBe("medium");
    expect(isTaskPriority("high")).toBe(true);
    expect(isTaskPriority("urgent")).toBe(false);
  });
});
