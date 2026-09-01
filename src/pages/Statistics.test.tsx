// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Statistics from "./Statistics";
import type { OverviewStatistics } from "../services/statisticsService";
import type { AchievementProgressView } from "../services/achievementService";

afterEach(cleanup);

function makeOverview(overrides: Partial<OverviewStatistics> = {}): OverviewStatistics {
  return {
    totalSeconds: 1500,
    sessionCount: 2,
    completedFocusCount: 1,
    avgSessionSeconds: 750,
    avgDailySeconds: 1500,
    topCategory: "开发",
    taskCreated: 5,
    taskCompleted: 3,
    taskIncomplete: 2,
    completionRate: 0.6,
    categoryStats: [],
    dailyFocus: [],
    dailyCompletedTasks: [],
    ...overrides,
  };
}

const statsState = vi.hoisted(() => ({
  tab: "statistics",
  range: "today",
  customFrom: "2026-08-27",
  customTo: "2026-08-27",
  loading: false,
  hourlyStats: [] as unknown[],
  overview: null as OverviewStatistics | null,
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
    statsState.overview = null;
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

  it("统计 Tab 有数据时显示核心指标", () => {
    statsState.overview = makeOverview();
    render(<Statistics />);
    expect(screen.getByText("总投入")).toBeTruthy();
    expect(screen.getByText("专注次数")).toBeTruthy();
    expect(screen.getByText("完成任务")).toBeTruthy();
    expect(screen.getByText("完成率")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy(); // 完成率 0.6
    expect(screen.getByText("开发")).toBeTruthy(); // 最常类别
  });
});
