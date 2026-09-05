// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useLayoutModeStore } from "./layoutMode";
import { LayoutModeSwitcher } from "../components/LayoutModeSwitcher";

const settingsMock = vi.hoisted(() => ({
  update: vi.fn(async () => undefined),
}));
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({
      update: settingsMock.update,
      settings: { defaultLayoutMode: "standard" },
    }),
}));

const appMock = vi.hoisted(() => ({ pushToast: vi.fn() }));
vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ pushToast: appMock.pushToast }),
}));

afterEach(() => {
  cleanup();
  useLayoutModeStore.setState({ current: "standard" });
  vi.clearAllMocks();
});

describe("layoutMode 会话级状态（A3）", () => {
  it("默认 standard；setCurrent 只改会话值", () => {
    expect(useLayoutModeStore.getState().current).toBe("standard");
    useLayoutModeStore.getState().setCurrent("compact");
    expect(useLayoutModeStore.getState().current).toBe("compact");
  });
});

describe("LayoutModeSwitcher（V2.4 常驻三段按钮）", () => {
  it("三段按钮常驻可见（标准/紧凑/专注），无弹层", () => {
    render(<LayoutModeSwitcher />);
    expect(screen.getByRole("button", { name: "切换视图：Standard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "切换视图：Compact" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "切换视图：Focus" })).toBeTruthy();
    // 无旧弹层的「设为默认」入口（默认改由设置→外观管理）
    expect(screen.queryByText(/设为默认视图/)).toBeNull();
  });

  it("点击某段：切换会话 current 并 toast 提示（不写默认设置）", () => {
    render(<LayoutModeSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "切换视图：Compact" }));
    expect(useLayoutModeStore.getState().current).toBe("compact");
    expect(settingsMock.update).not.toHaveBeenCalled(); // 会话级切换不持久化默认
    expect(appMock.pushToast).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("紧凑"),
    );
  });

  it("当前模式高亮为 aria-pressed", () => {
    useLayoutModeStore.setState({ current: "focus" });
    render(<LayoutModeSwitcher />);
    expect(
      screen.getByRole("button", { name: "切换视图：Focus" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "切换视图：Standard" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
