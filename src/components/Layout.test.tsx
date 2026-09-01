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

const pomodoroMock = vi.hoisted(() => ({
  snapshot: { state: "IDLE", remainingMs: 0, elapsedMs: 0, progress: 0 },
  refresh: vi.fn(),
  endFocus: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  taskTitle: null,
}));
vi.mock("../stores/pomodoroStore", () => ({
  usePomodoroStore: (selector: (s: unknown) => unknown) => selector(pomodoroMock),
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
