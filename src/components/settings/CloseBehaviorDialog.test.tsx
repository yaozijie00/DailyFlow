// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CloseBehaviorDialog from "./CloseBehaviorDialog";

afterEach(cleanup);

const appMock = vi.hoisted(() => ({
  closeDialog: null as "first" | "exit-focus" | null,
  openCloseDialog: vi.fn(),
  closeCloseDialog: vi.fn(),
  pushToast: vi.fn(),
}));

const settingsMock = vi.hoisted(() => ({
  settings: { closeBehavior: "exit", closeBehaviorConfigured: false, notificationsEnabled: true },
  update: vi.fn(),
}));

const pomodoroMock = vi.hoisted(() => ({
  snapshot: { state: "IDLE" },
}));

const behaviorMock = vi.hoisted(() => ({
  hideToTray: vi.fn(),
  exitApp: vi.fn(),
}));

vi.mock("../../stores/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(appMock),
    { getState: () => appMock },
  ),
}));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) => selector(settingsMock),
}));
vi.mock("../../stores/pomodoroStore", () => ({
  usePomodoroStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(pomodoroMock),
    { getState: () => pomodoroMock },
  ),
}));
vi.mock("../../services/windowBehaviorService", () => ({
  hideToTray: behaviorMock.hideToTray,
  exitApp: behaviorMock.exitApp,
}));

describe("CloseBehaviorDialog（关闭行为对话框）", () => {
  beforeEach(() => {
    appMock.closeDialog = null;
    appMock.openCloseDialog.mockClear();
    appMock.closeCloseDialog.mockClear();
    settingsMock.update.mockClear();
    behaviorMock.hideToTray.mockClear();
    behaviorMock.exitApp.mockClear();
    settingsMock.settings = {
      closeBehavior: "exit",
      closeBehaviorConfigured: false,
      notificationsEnabled: true,
    };
    pomodoroMock.snapshot = { state: "IDLE" };
  });

  it("未打开时不渲染", () => {
    const { container } = render(<CloseBehaviorDialog />);
    expect(container.childNodes.length).toBe(0);
  });

  it("首次关闭：显示两个选项与「记住我的选择」", () => {
    appMock.closeDialog = "first";
    render(<CloseBehaviorDialog />);
    expect(screen.getByText("关闭 DailyFlow")).toBeTruthy();
    expect(screen.getByText("退出 DailyFlow")).toBeTruthy();
    expect(screen.getByText("隐藏到系统托盘，继续运行")).toBeTruthy();
    expect(screen.getByText(/记住我的选择/)).toBeTruthy();
  });

  it("选择「隐藏到系统托盘」+ 记住 → 保存设置并隐藏窗口", async () => {
    appMock.closeDialog = "first";
    settingsMock.update.mockResolvedValue(undefined);
    render(<CloseBehaviorDialog />);
    fireEvent.click(screen.getByText("隐藏到系统托盘，继续运行"));
    fireEvent.click(screen.getByText(/记住我的选择/));
    fireEvent.click(screen.getByText("确定"));
    await vi.waitFor(() =>
      expect(settingsMock.update).toHaveBeenCalledWith({
        closeBehavior: "tray",
        closeBehaviorConfigured: true,
      }),
    );
    expect(behaviorMock.hideToTray).toHaveBeenCalled();
    expect(appMock.closeCloseDialog).toHaveBeenCalled();
  });

  it("选择「退出 DailyFlow」（Focus 空闲）→ 直接退出", async () => {
    appMock.closeDialog = "first";
    render(<CloseBehaviorDialog />);
    // 默认选中 exit；勾选记住
    fireEvent.click(screen.getByText(/记住我的选择/));
    fireEvent.click(screen.getByText("确定"));
    await vi.waitFor(() => expect(behaviorMock.exitApp).toHaveBeenCalled());
  });

  it("Focus 运行中选「退出」→ 弹出退出确认，确认后退出", async () => {
    appMock.closeDialog = "first";
    pomodoroMock.snapshot = { state: "RUNNING" };
    render(<CloseBehaviorDialog />);
    fireEvent.click(screen.getByText("确定")); // 默认 exit
    await vi.waitFor(() =>
      expect(appMock.openCloseDialog).toHaveBeenCalledWith("exit-focus"),
    );
    expect(behaviorMock.exitApp).not.toHaveBeenCalled();
    // 切换为确认态（重新渲染）
    cleanup();
    appMock.closeDialog = "exit-focus";
    render(<CloseBehaviorDialog />);
    fireEvent.click(screen.getByText("继续退出"));
    await vi.waitFor(() => expect(behaviorMock.exitApp).toHaveBeenCalled());
  });

  it("退出确认对话框：取消不退出", () => {
    appMock.closeDialog = "exit-focus";
    render(<CloseBehaviorDialog />);
    expect(screen.getByText(/当前正在进行专注，退出后本次专注将被结束/)).toBeTruthy();
    fireEvent.click(screen.getByText("取消"));
    expect(behaviorMock.exitApp).not.toHaveBeenCalled();
    expect(appMock.closeCloseDialog).toHaveBeenCalled();
  });

  it("取消：不保存、不执行（下次仍询问）", () => {
    appMock.closeDialog = "first";
    render(<CloseBehaviorDialog />);
    fireEvent.click(screen.getByText("取消"));
    expect(settingsMock.update).not.toHaveBeenCalled();
    expect(behaviorMock.hideToTray).not.toHaveBeenCalled();
    expect(behaviorMock.exitApp).not.toHaveBeenCalled();
    expect(appMock.closeCloseDialog).toHaveBeenCalled();
  });
});
