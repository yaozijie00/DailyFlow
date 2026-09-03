// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaskDetail from "./TaskDetail";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  selectedTaskId: null as number | null,
  tasks: [] as Task[],
  categories: [] as { id: number; name: string; sortOrder: number; color: string | null; createdAt: number }[],
  goals: [] as { id: number; title: string }[],
  completeTask: vi.fn(),
  cancelTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTask: vi.fn(),
  selectTask: vi.fn(),
  openEdit: vi.fn(),
}));

const focusStatsMock = vi.hoisted(() => ({
  getTaskFocusStats: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
  taskService: focusStatsMock,
}));
vi.mock("../../stores/goalStore", () => ({
  useGoalStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
vi.mock("../../stores/pomodoroStore", () => ({
  usePomodoroStore: (selector: (s: unknown) => unknown) => selector({ focusVersion: 0 }),
}));
vi.mock("../../stores/projectStore", () => ({
  useProjectStore: (selector: (s: unknown) => unknown) =>
    selector({ projects: [] as { id: number; title: string }[] }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "写代码",
    categoryId: null,
    status: "TODO",
    estimatedDuration: 1800,
    plannedStart: new Date(2026, 7, 27, 9, 0).getTime(),
    plannedEnd: new Date(2026, 7, 27, 10, 0).getTime(),
    actualDuration: 600,
    scheduledDate: "2026-08-27",
    createdAt: new Date(2026, 7, 27, 9, 30).getTime(),
    updatedAt: new Date(2026, 7, 27, 9, 30).getTime(),
    completedAt: null,
    notes: null,
    sortOrder: 0,
    goalId: null,
    repeatRule: "",
    projectId: null,
    parentId: null,
    ...overrides,
  };
}

describe("TaskDetail（右侧详情面板）", () => {
  beforeEach(() => {
    mockState.selectedTaskId = null;
    mockState.tasks = [];
    mockState.goals = [];
    focusStatsMock.getTaskFocusStats.mockReset();
    focusStatsMock.getTaskFocusStats.mockResolvedValue({ totalSeconds: 900, count: 2, completedCount: 1 });
  });

  it("无选中任务时显示占位提示", () => {
    render(<TaskDetail />);
    expect(screen.getByText(/点击左侧任务或时间轴任务块查看详情/)).toBeTruthy();
  });

  it("选中任务：显示标题与各元数据字段", async () => {
    mockState.selectedTaskId = 1;
    mockState.tasks = [makeTask()];
    render(<TaskDetail />);
    expect(screen.getByText("写代码")).toBeTruthy();
    expect(screen.getByText(/09:00 - 10:00/)).toBeTruthy(); // 计划时间
    expect(screen.getByText(/30分钟/)).toBeTruthy(); // 预计
    expect(screen.getByText(/10分钟/)).toBeTruthy(); // 实际
    expect(screen.getByText(/待办/)).toBeTruthy(); // 状态
    expect(screen.getAllByText(/2026-08-27/).length).toBeGreaterThan(0); // 创建时间/当前日期
    await screen.findByText(/15分钟/); // Focus 投入（异步）
    expect(await screen.findByText(/2 次（完成 1 个番茄）/)).toBeTruthy();
  });

  it("延期快捷：「明天」改 scheduledDate 并清空选中", () => {
    mockState.selectedTaskId = 1;
    mockState.tasks = [makeTask()];
    mockState.updateTask.mockResolvedValue(undefined);
    render(<TaskDetail />);
    fireEvent.click(screen.getByText(/明天/));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(mockState.updateTask).toHaveBeenCalledWith(1, { scheduledDate: ymd });
    expect(mockState.selectTask).toHaveBeenCalledWith(null);
  });

  it("切换选中任务：详情更新为另一个任务", () => {
    mockState.selectedTaskId = 2;
    mockState.tasks = [makeTask({ id: 1, title: "任务一" }), makeTask({ id: 2, title: "任务二" })];
    render(<TaskDetail />);
    expect(screen.getByText("任务二")).toBeTruthy();
    fireEvent.click(screen.getByText("完成任务"));
    expect(mockState.completeTask).toHaveBeenCalledWith(2);
  });

  it("显示关联目标名称", () => {
    mockState.selectedTaskId = 1;
    mockState.tasks = [makeTask({ goalId: 7 })];
    mockState.goals = [{ id: 7, title: "三个月内重构" }];
    render(<TaskDetail />);
    expect(screen.getByText("三个月内重构")).toBeTruthy();
  });

  it("操作按钮：取消 / 编辑 / 删除", () => {
    mockState.selectedTaskId = 1;
    mockState.tasks = [makeTask()];
    render(<TaskDetail />);
    fireEvent.click(screen.getByText("取消任务"));
    expect(mockState.cancelTask).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("编辑"));
    expect(mockState.openEdit).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByText("删除"));
    expect(mockState.deleteTask).toHaveBeenCalledWith(1);
  });

  it("已完成任务：不显示完成/取消按钮，显示完成时间", () => {
    mockState.selectedTaskId = 1;
    mockState.tasks = [
      makeTask({ status: "COMPLETED", completedAt: new Date(2026, 7, 27, 12, 0).getTime() }),
    ];
    render(<TaskDetail />);
    expect(screen.queryByText("完成任务")).toBeNull();
    expect(screen.queryByText("取消任务")).toBeNull();
    expect(screen.getByText(/完成时间/)).toBeTruthy();
  });
});
