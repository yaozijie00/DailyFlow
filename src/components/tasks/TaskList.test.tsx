// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaskList from "./TaskList";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  tasks: [] as Task[],
  categories: [] as { id: number; name: string; sortOrder: number; color: string | null; createdAt: number }[],
  selectedTaskId: null,
  toggleComplete: vi.fn(),
  selectTask: vi.fn(),
  reorderTasks: vi.fn(),
  startTaskDrag: vi.fn(),
  endTaskDrag: vi.fn(),
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
    sortOrder: 0,
    ...overrides,
  };
}

describe("TaskList", () => {
  beforeEach(() => {
    mockState.tasks = [];
    mockState.toggleComplete.mockClear();
    mockState.reorderTasks.mockClear();
  });

  it("渲染任务标题与状态筛选栏", () => {
    mockState.tasks = [
      makeTask({ id: 1, title: "写代码", status: "TODO" }),
      makeTask({ id: 2, title: "读文档", status: "COMPLETED" }),
    ];
    render(<TaskList />);
    expect(screen.getByText("写代码")).toBeTruthy();
    expect(screen.getByText("读文档")).toBeTruthy();
    expect(screen.getByText("全部")).toBeTruthy();
    expect(screen.getByText("执行中")).toBeTruthy();
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

  it("按状态筛选：点「已完成」只显示已完成任务", () => {
    mockState.tasks = [
      makeTask({ id: 1, title: "待办任务", status: "TODO" }),
      makeTask({ id: 2, title: "完成任务", status: "COMPLETED" }),
    ];
    render(<TaskList />);
    fireEvent.click(screen.getAllByText("已完成")[0]); // 筛选 Tab（行状态标签也在）
    expect(screen.getByText("完成任务")).toBeTruthy();
    expect(screen.queryByText("待办任务")).toBeNull();
  });

  it("筛选无匹配时显示空提示", () => {
    mockState.tasks = [makeTask({ id: 1, title: "写代码", status: "TODO" })];
    render(<TaskList />);
    fireEvent.click(screen.getByText("执行中"));
    expect(screen.getByText(/无匹配的任务/)).toBeTruthy();
  });

  it("按分类筛选", () => {
    mockState.categories = [{ id: 5, name: "开发", sortOrder: 0, color: "#000", createdAt: 0 }];
    mockState.tasks = [
      makeTask({ id: 1, title: "开发任务", categoryId: 5 }),
      makeTask({ id: 2, title: "其他任务", categoryId: null }),
    ];
    render(<TaskList />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    expect(screen.getByText("开发任务")).toBeTruthy();
    expect(screen.queryByText("其他任务")).toBeNull();
  });

  it("拖动排序：drop 到另一行触发 reorderTasks", () => {
    mockState.tasks = [makeTask({ id: 1, title: "A" }), makeTask({ id: 2, title: "B" })];
    render(<TaskList />);
    // 行 2（B）的 grip drop，数据为行 1（A）→ 把 A 移到 B 前（已是，但应调用 reorder）
    const grips = screen.getAllByTitle("拖动调整顺序");
    fireEvent.dragStart(grips[1], { dataTransfer: { setData: () => {}, getData: () => "1" } });
    fireEvent.drop(grips[1], { dataTransfer: { getData: () => "1" } });
    expect(mockState.reorderTasks).toHaveBeenCalled();
  });

  it("无任务时显示空状态提示", () => {
    render(<TaskList />);
    expect(screen.getByText(/暂无任务/)).toBeTruthy();
  });
});
