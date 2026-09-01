import { describe, it, expect } from "vitest";
import {
  resolveCloseAction,
  type CloseAction,
} from "./windowBehaviorService";
import type { CloseBehavior } from "./settingsService";

describe("resolveCloseAction（窗口关闭决策）", () => {
  const cases: Array<{
    configured: boolean;
    behavior: CloseBehavior;
    running: boolean;
    expected: CloseAction;
  }> = [
    // 未配置（旧版本升级 / 首次）：总是询问
    { configured: false, behavior: "exit", running: false, expected: "dialog" },
    { configured: false, behavior: "tray", running: true, expected: "dialog" },
    // 已配置 → 托盘：隐藏，Focus 运行与否都继续
    { configured: true, behavior: "tray", running: false, expected: "hide" },
    { configured: true, behavior: "tray", running: true, expected: "hide" },
    // 已配置 → 退出：Focus 未运行直接退出；运行中先确认
    { configured: true, behavior: "exit", running: false, expected: "exit" },
    { configured: true, behavior: "exit", running: true, expected: "exit-confirm" },
  ];

  for (const c of cases) {
    it(`${c.configured ? "已配置" : "未配置"} ${c.behavior} Focus${c.running ? "运行中" : "空闲"} → ${c.expected}`, () => {
      expect(resolveCloseAction(c.configured, c.behavior, c.running)).toBe(c.expected);
    });
  }
});
