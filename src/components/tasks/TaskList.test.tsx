// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaskList from "./TaskList";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  tasks: [] as Task[],
  categories: [],
  selectedTaskId: null,
  toggleComplete: vi.fn(),
  selectTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "写代码",
    categoryId: null,
    status: "TODO",
    estimatedDuration: null,
    plannedStart: null,
    plannedEnd: null,
    actualDuration: 0,
    scheduledDate: "2026-08-27",
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    notes: null,
    ...overrides,
  };
}

describe("TaskList", () => {
  beforeEach(() => {
    mockState.tasks = [];
    mockState.toggleComplete.mockClear();
  });

  it("渲染任务标题与状态标签", () => {
    mockState.tasks = [
      makeTask({ id: 1, title: "写代码", status: "TODO" }),
      makeTask({ id: 2, title: "读文档", status: "COMPLETED" }),
    ];
    render(<TaskList />);
    expect(screen.getByText("写代码")).toBeTruthy();
    expect(screen.getByText("读文档")).toBeTruthy();
    expect(screen.getByText("待办")).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
  });

  it("点击圆圈完成任务（toggleComplete）", () => {
    mockState.tasks = [makeTask({ id: 7, title: "写代码" })];
    render(<TaskList />);
    fireEvent.click(screen.getByLabelText("完成任务"));
    expect(mockState.toggleComplete).toHaveBeenCalledWith(7);
  });

  it("已完成任务点击圆圈可恢复为未完成", () => {
    mockState.tasks = [
      makeTask({ id: 7, title: "写代码", status: "COMPLETED", completedAt: 1 }),
    ];
    render(<TaskList />);
    fireEvent.click(screen.getByLabelText("恢复为未完成"));
    expect(mockState.toggleComplete).toHaveBeenCalledWith(7);
  });

  it("无任务时显示空状态提示", () => {
    render(<TaskList />);
    expect(screen.getByText(/暂无任务/)).toBeTruthy();
  });
});
