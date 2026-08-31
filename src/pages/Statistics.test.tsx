// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Statistics from "./Statistics";
import type { RangeStatistics } from "../services/statisticsService";
import type { AchievementProgressView } from "../services/achievementService";

afterEach(cleanup);

const statsState = vi.hoisted(() => ({
  tab: "statistics",
  range: "today",
  customFrom: "2026-08-27",
  customTo: "2026-08-27",
  loading: false,
  rangeStats: null as RangeStatistics | null,
  categoryStats: [] as unknown[],
  hourlyStats: [] as unknown[],
  setTab: vi.fn(),
  setRange: vi.fn(),
  setCustomRange: vi.fn(),
  load: vi.fn(),
}));

const achState = vi.hoisted(() => ({
  items: [] as AchievementProgressView[],
  loading: false,
  filter: "all",
  load: vi.fn(),
  setFilter: vi.fn(),
}));

vi.mock("../stores/statisticsStore", () => ({
  useStatisticsStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(statsState),
    { getState: () => statsState },
  ),
}));
vi.mock("../stores/achievementStore", () => ({
  useAchievementStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(achState),
    { getState: () => achState },
  ),
}));
vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ dbStatus: "ready", pushToast: vi.fn() }),
}));

function makeAchievement(overrides: Partial<AchievementProgressView> = {}): AchievementProgressView {
  return {
    id: "first_pomodoro",
    name: "第一个番茄",
    description: "完成 1 个番茄钟",
    icon: "Flag",
    category: "basic",
    condition: { type: "event_count", target: 1 },
    reward: null,
    hidden: false,
    enabled: true,
    chainId: null,
    order: 0,
    current: 1,
    target: 1,
    percentage: 100,
    completed: true,
    unit: "count",
    unlocked: true,
    unlockedAt: 0,
    ...overrides,
  };
}

describe("Statistics 页面（统计 + 成就 Tab）", () => {
  beforeEach(() => {
    statsState.tab = "statistics";
    statsState.rangeStats = null;
    statsState.categoryStats = [];
    statsState.hourlyStats = [];
    achState.items = [];
    achState.loading = false;
    achState.filter = "all";
  });

  it("默认显示统计 Tab（范围选择 + 空状态）", () => {
    render(<Statistics />);
    expect(screen.getByRole("button", { name: "统计" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "今日" })).toBeTruthy();
    expect(screen.getByText(/这个时间段还没有投入记录/)).toBeTruthy();
  });

  it("顶层 Tab 切换调用 setTab（成就 / 统计）", () => {
    render(<Statistics />);
    fireEvent.click(screen.getByRole("button", { name: "成就" }));
    expect(statsState.setTab).toHaveBeenCalledWith("achievements");
    fireEvent.click(screen.getByRole("button", { name: "统计" }));
    expect(statsState.setTab).toHaveBeenCalledWith("statistics");
  });

  it("成就 Tab 渲染已解锁成就卡片（filter=已解锁）", () => {
    achState.filter = "unlocked";
    achState.items = [makeAchievement({ unlocked: true })];
    statsState.tab = "achievements";
    render(<Statistics />);
    expect(screen.getByText("第一个番茄")).toBeTruthy();
    expect(screen.getByText("✓ 已解锁")).toBeTruthy();
  });

  it("成就 Tab 空状态", () => {
    statsState.tab = "achievements";
    render(<Statistics />);
    expect(screen.getByText(/暂无成就/)).toBeTruthy();
  });

  it("统计 Tab 有数据时显示汇总卡", () => {
    statsState.rangeStats = { totalSeconds: 1500, completedCount: 1, eventCount: 2 };
    render(<Statistics />);
    expect(screen.getByText("总投入")).toBeTruthy();
    expect(screen.getByText("完成番茄")).toBeTruthy();
  });
});
