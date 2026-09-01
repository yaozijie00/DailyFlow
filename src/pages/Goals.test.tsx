// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Goals from "../pages/Goals";
import type { Goal, GoalWithProgress } from "../db/repositories/goalRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  goals: [] as GoalWithProgress[],
  completedGoals: [] as Goal[],
  loading: false,
  load: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../stores/goalStore", () => ({
  useGoalStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}));
vi.mock("../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ dbStatus: "ready", pushToast: vi.fn() }),
}));

function makeGoal(overrides: Partial<GoalWithProgress> = {}): GoalWithProgress {
  return {
    id: 1,
    title: "完成 DailyFlow V2",
    description: null,
    deadline: "2026-09-20",
    startDate: "2026-09-01",
    priority: "medium",
    manualProgress: null,
    status: "active",
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    totalTasks: 0,
    completedTasks: 0,
    progressPercent: 0,
    focusSeconds: 0,
    ...overrides,
  };
}

describe("Goals 页面（长期月视图）", () => {
  beforeEach(() => {
    mockState.goals = [];
    mockState.completedGoals = [];
    mockState.loading = false;
    mockState.create.mockClear();
    mockState.update.mockClear();
    mockState.complete.mockClear();
    mockState.remove.mockClear();
  });

  it("无目标时显示空状态", () => {
    render(<Goals />);
    expect(screen.getByText(/暂无长期任务/)).toBeTruthy();
  });

  it("渲染带日期范围的长期任务块", () => {
    mockState.goals = [makeGoal()];
    render(<Goals />);
    expect(screen.getAllByText("完成 DailyFlow V2").length).toBeGreaterThan(0);
  });

  it("新建：填写名称/日期/优先级/手动进度并提交", () => {
    mockState.create.mockResolvedValue(undefined);
    render(<Goals />);
    fireEvent.click(screen.getByText("新建"));
    fireEvent.change(screen.getByPlaceholderText(/名称/), { target: { value: "旅行计划" } });
    fireEvent.change(screen.getByPlaceholderText(/进度%/), { target: { value: "40" } });
    fireEvent.click(screen.getByText("添加"));
    expect(mockState.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "旅行计划", manualProgress: 40 }),
    );
  });

  it("点击任务块打开编辑弹窗，保存调用 update", () => {
    mockState.goals = [makeGoal()];
    mockState.update.mockResolvedValue(undefined);
    render(<Goals />);
    fireEvent.click(screen.getByLabelText("编辑长期任务"));
    expect(screen.getByText("编辑长期任务")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("完成 DailyFlow V2"), { target: { value: "改名" } });
    fireEvent.click(screen.getByText("保存"));
    expect(mockState.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ title: "改名" }),
    );
  });

  it("编辑弹窗内完成/删除", () => {
    mockState.goals = [makeGoal()];
    render(<Goals />);
    fireEvent.click(screen.getByLabelText("编辑长期任务"));
    fireEvent.click(screen.getByText("完成"));
    expect(mockState.complete).toHaveBeenCalledWith(1);
  });

  it("未安排日期的目标显示在「未安排日期」区", () => {
    mockState.goals = [makeGoal({ startDate: null, deadline: null, title: "没有日期" })];
    render(<Goals />);
    expect(screen.getByText(/未安排日期/)).toBeTruthy();
    expect(screen.getByText("没有日期")).toBeTruthy();
  });

  it("已完成目标折叠区可展开", () => {
    mockState.completedGoals = [
      makeGoal({ id: 9, title: "已完成目标", status: "completed" }),
    ];
    render(<Goals />);
    expect(screen.queryByText("已完成目标")).toBeNull();
    fireEvent.click(screen.getByText(/已完成（1）/));
    expect(screen.getByText("已完成目标")).toBeTruthy();
  });
});
