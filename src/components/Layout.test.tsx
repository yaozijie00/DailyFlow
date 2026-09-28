// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import Layout from "./Layout";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  currentPage: "today",
  setPage: vi.fn(),
  dbStatus: "ready",
  dbError: null,
  toasts: [],
  achievementToasts: [],
  closeDialog: null,
  pushToast: vi.fn(),
  removeToast: vi.fn(),
  pushAchievement: vi.fn(),
  removeAchievementToast: vi.fn(),
  openCloseDialog: vi.fn(),
  closeCloseDialog: vi.fn(),
}));

vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));


const extMock = vi.hoisted(() => ({
  enabled: {},
  revision: 0,
  loading: false,
  init: vi.fn(),
  setEnabled: vi.fn(),
  isEnabled: vi.fn(() => false),
}));

vi.mock("../stores/extensionStore", () => ({
  useExtensionStore: (selector: (s: unknown) => unknown) => selector(extMock),
}));

describe("Layout 主导航", () => {
  it("导航顺序：今日 → 专注 → 长期 → 统计 → 设置", () => {
    render(<Layout>content</Layout>);
    const nav = screen.getByRole("navigation");
    const labels = within(nav)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["今日", "专注", "长期", "统计", "设置"]);
  });

  it("侧栏分组：核心/扩展/系统 三区（无启用扩展时不显示「扩展」区）", () => {
    render(<Layout>content</Layout>);
    const nav = screen.getByRole("navigation");
    // 组标题是文本块（非按钮）：核心与系统恒显示
    expect(within(nav).getByText("核心")).toBeTruthy();
    expect(within(nav).getByText("系统")).toBeTruthy();
    // 扩展区无启用扩展 → 不渲染标题
    expect(within(nav).queryByText("扩展")).toBeNull();
    // 设置归入系统区且排最后
    const buttons = within(nav).getAllByRole("button");
    expect(buttons[buttons.length - 1]?.textContent).toBe("设置");
  });

  it("无新闻导航项（News 已移除）", () => {
    render(<Layout>content</Layout>);
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByText("新闻")).toBeNull();
  });

  it("点击导航调用 setPage", () => {
    render(<Layout>content</Layout>);
    const nav = screen.getByRole("navigation");
    within(nav).getByText("统计").click();
    expect(mockState.setPage).toHaveBeenCalledWith("statistics");
  });
});
