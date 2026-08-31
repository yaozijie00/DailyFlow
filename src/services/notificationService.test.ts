import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyFocus } from "./notificationService";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

const sendNotificationMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: sendNotificationMock,
}));

beforeEach(() => {
  sendNotificationMock.mockReset();
  useAppStore.setState({ toasts: [] });
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, notificationsEnabled: true },
  });
});

describe("notifyFocus（专注通知）", () => {
  it("开关开启 → 调用系统通知", () => {
    sendNotificationMock.mockImplementation(() => {});
    notifyFocus("开始专注", "写代码");
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "开始专注",
      body: "写代码",
    });
  });

  it("开关关闭 → 不发送通知", () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, notificationsEnabled: false },
    });
    notifyFocus("开始专注", "写代码");
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it("非 Tauri 环境调用抛错 → 回退全局 Toast", () => {
    sendNotificationMock.mockImplementation(() => {
      throw new Error("no tauri");
    });
    notifyFocus("专注完成", "写代码");
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].text).toContain("专注完成");
  });
});
