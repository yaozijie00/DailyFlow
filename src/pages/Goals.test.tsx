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
    title: "三个月内完成 App 重构",
    description: null,
    deadline: null,
    status: "active",
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    totalTasks: 0,
    completedTasks: 0,
    ...overrides,
  };
}

describe("Goals 页面", () => {
  beforeEach(() => {
    mockState.goals = [];
    mockState.completedGoals = [];
    mockState.loading = false;
    mockState.create.mockClear();
    mockState.complete.mockClear();
    mockState.remove.mockClear();
    mockState.update.mockClear();
  });

  it("无目标时显示空状态", () => {
    render(<Goals />);
    expect(screen.getByText(/暂无进行中的目标/)).toBeTruthy();
  });

  it("渲染进行中目标卡片与进度", () => {
    mockState.goals = [
      makeGoal({
        id: 1,
        title: "目标 A",
        description: "说明",
        deadline: "2026-12-31",
        totalTasks: 4,
        completedTasks: 1,
      }),
    ];
    render(<Goals />);
    expect(screen.getByText("目标 A")).toBeTruthy();
    expect(screen.getByText("说明")).toBeTruthy();
    expect(screen.getByText(/截止 2026-12-31/)).toBeTruthy();
    expect(screen.getByText(/关联任务 1\/4/)).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("无关联任务显示『暂无任务』", () => {
    mockState.goals = [makeGoal({ id: 1, title: "目标 A" })];
    render(<Goals />);
    expect(screen.getByText(/暂无任务/)).toBeTruthy();
    expect(screen.getByText(/关联任务 0\/0/)).toBeTruthy();
  });

  it("新建目标：填写并提交调用 create，成功关闭表单", async () => {
    mockState.create.mockResolvedValue(undefined);
    render(<Goals />);
    fireEvent.click(screen.getByText("新建目标"));
    fireEvent.change(screen.getByPlaceholderText(/目标名称/), {
      target: { value: "新目标" },
    });
    fireEvent.change(screen.getByPlaceholderText(/补充说明/), {
      target: { value: "新说明" },
    });
    fireEvent.click(screen.getByText("添加"));
    expect(mockState.create).toHaveBeenCalledWith({
      title: "新目标",
      description: "新说明",
      deadline: null,
    });
  });

  it("完成/删除按钮调用对应 store 方法", () => {
    mockState.goals = [makeGoal({ id: 7, title: "目标 A" })];
    render(<Goals />);
    fireEvent.click(screen.getByLabelText("完成目标"));
    expect(mockState.complete).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByLabelText("删除目标"));
    expect(mockState.remove).toHaveBeenCalledWith(7);
  });

  it("编辑：进入编辑态并保存调用 update", async () => {
    mockState.goals = [makeGoal({ id: 3, title: "旧标题" })];
    mockState.update.mockResolvedValue(undefined);
    render(<Goals />);
    fireEvent.click(screen.getByLabelText("编辑目标"));
    const input = screen.getByPlaceholderText("目标名称");
    fireEvent.change(input, { target: { value: "新标题" } });
    fireEvent.click(screen.getByText("保存"));
    expect(mockState.update).toHaveBeenCalledWith(3, {
      title: "新标题",
      description: null,
      deadline: null,
    });
  });

  it("已完成目标折叠区可展开", () => {
    mockState.completedGoals = [makeGoal({ id: 9, title: "已完成目标", status: "completed" })];
    render(<Goals />);
    expect(screen.queryByText("已完成目标")).toBeNull();
    fireEvent.click(screen.getByText(/已完成（1）/));
    expect(screen.getByText("已完成目标")).toBeTruthy();
  });
});
