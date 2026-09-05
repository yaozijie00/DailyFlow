import { describe, it, expect } from "vitest";
import { filterByExtensionEnabled } from "./achievementStore";

interface Sample {
  id: string;
  extensionId?: string;
}

const enabledExt = new Set(["com.dailyflow.course-schedule"]);
const isEnabled = (id: string) => enabledExt.has(id);

describe("filterByExtensionEnabled（成就随扩展启停展示）", () => {
  it("Core 成就（无 extensionId）恒展示", () => {
    const items: Sample[] = [{ id: "first_pomodoro" }];
    // 即使所有扩展都禁用也保留 Core 成就
    expect(filterByExtensionEnabled(items, () => false)).toHaveLength(1);
  });

  it("启用扩展的成就展示", () => {
    const items: Sample[] = [
      { id: "course-first", extensionId: "com.dailyflow.course-schedule" },
    ];
    expect(filterByExtensionEnabled(items, isEnabled).map((i) => i.id)).toEqual(["course-first"]);
  });

  it("禁用扩展的成就（含已解锁）被隐藏", () => {
    const items: Sample[] = [
      { id: "course-first", extensionId: "com.dailyflow.course-schedule", /* unlocked */ },
    ];
    // 课程扩展禁用 → 成就列表消失（解锁与否均不显示）
    expect(filterByExtensionEnabled(items, () => false)).toHaveLength(0);
  });

  it("混合：Core + 启用扩展 + 禁用扩展 → 只保留前两者", () => {
    const items: Sample[] = [
      { id: "a", extensionId: "com.dailyflow.course-schedule" }, // 启用
      { id: "b", extensionId: "com.dailyflow.workflow" }, // 禁用
      { id: "c" }, // Core
    ];
    const out = filterByExtensionEnabled(items, isEnabled).map((i) => i.id);
    expect(out).toEqual(["a", "c"]);
  });
});
