import { describe, it, expect, beforeEach } from "vitest";
import { notifyFocus } from "./notificationService";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

beforeEach(() => {
  useAppStore.setState({ toasts: [] });
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, notificationsEnabled: true },
  });
});

describe("notifyFocus（专注通知，应用内 Toast）", () => {
  it("开关开启 → 弹出全局 Toast", () => {
    notifyFocus("开始专注", "写代码");
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].text).toBe("开始专注：写代码");
  });

  it("开关关闭 → 不弹 Toast", () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, notificationsEnabled: false },
    });
    notifyFocus("开始专注", "写代码");
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});
