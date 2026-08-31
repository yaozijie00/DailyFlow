import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyFocusStart, notifyFocusEnd } from "./notificationService";
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

describe("notifyFocusStart（开始：应用内 Toast）", () => {
  it("弹出全局 Toast", () => {
    notifyFocusStart("写代码");
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].text).toBe("开始专注：写代码");
  });

  it("开关关闭 → 不弹", () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, notificationsEnabled: false },
    });
    notifyFocusStart("写代码");
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});

describe("notifyFocusEnd（结束：系统通知，标题 DailyFlow）", () => {
  it("走满 → 系统通知「专注完成：任务名」", () => {
    sendNotificationMock.mockImplementation(() => {});
    notifyFocusEnd("写代码", true);
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "DailyFlow",
      body: "专注完成：写代码",
    });
  });

  it("提前结束 → 系统通知「专注结束：任务名」", () => {
    sendNotificationMock.mockImplementation(() => {});
    notifyFocusEnd("写代码", false);
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "DailyFlow",
      body: "专注结束：写代码",
    });
  });

  it("开关关闭 → 不通知", () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, notificationsEnabled: false },
    });
    notifyFocusEnd("写代码", true);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });

  it("系统通知不可用（抛错）→ 回退应用内 Toast", () => {
    sendNotificationMock.mockImplementation(() => {
      throw new Error("no tauri");
    });
    notifyFocusEnd("写代码", true);
    expect(useAppStore.getState().toasts).toHaveLength(1);
    expect(useAppStore.getState().toasts[0].text).toContain("专注完成");
  });
});
