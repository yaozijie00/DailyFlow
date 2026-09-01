import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifyFocusStart,
  notifyFocusEnd,
  scheduleFocusEndNotification,
  cancelScheduledFocusEndNotification,
} from "./notificationService";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

const sendNotificationMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: sendNotificationMock,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

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

  it("提前结束含实际投入分钟 → 正文体现实际时长", () => {
    sendNotificationMock.mockImplementation(() => {});
    notifyFocusEnd("写代码", false, 8);
    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: "DailyFlow",
      body: "专注结束：写代码，本次实际投入 8 分钟",
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

describe("scheduleFocusEndNotification（Rust 原生调度）", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(42);
  });

  it("调用 Rust 调度命令并传结束时刻与计划分钟", () => {
    scheduleFocusEndNotification(1_752_000_000_000, 25);
    expect(invokeMock).toHaveBeenCalledWith("schedule_focus_end_notification", {
      endAtMs: 1_752_000_000_000,
      plannedMinutes: 25,
    });
  });

  it("开关关闭时不调度", () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, notificationsEnabled: false },
    });
    scheduleFocusEndNotification(1000, 25);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("调度成功后 cancel 调用取消命令（幂等）", async () => {
    scheduleFocusEndNotification(1000, 25);
    await vi.waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("schedule_focus_end_notification", expect.anything()),
    );
    cancelScheduledFocusEndNotification();
    expect(invokeMock).toHaveBeenCalledWith("cancel_focus_notification", { timerId: 42 });
    // 再次取消（无活跃调度）不报错
    cancelScheduledFocusEndNotification();
  });

  it("调度失败静默（不影响专注流程）", () => {
    invokeMock.mockRejectedValue(new Error("no tauri"));
    expect(() => scheduleFocusEndNotification(1000, 25)).not.toThrow();
  });
});
