// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaskList from "./TaskList";
import { convertNoteToTask } from "../../lib/noteConvert";
import type { Task } from "../../db/repositories/taskRepository";
import type { Note } from "../../db/repositories/noteRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  tasks: [] as Task[],
  categories: [] as { id: number; name: string; sortOrder: number; color: string | null; createdAt: number }[],
  selectedTaskId: null,
  toggleComplete: vi.fn(),
  selectTask: vi.fn(),
  reorderTasks: vi.fn(),
  createTask: vi.fn(),
  startTaskDrag: vi.fn(),
  endTaskDrag: vi.fn(),
}));

const noteMockState = vi.hoisted(() => ({
  notes: [] as Note[],
  update: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
vi.mock("../../stores/noteStore", () => ({
  useNoteStore: (selector: (s: unknown) => unknown) => selector(noteMockState),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    title: "设计背包 UI",
    categoryId: null,
    status: "active",
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

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
    goalId: null,
    ...overrides,
  };
}

describe("TaskList", () => {
  beforeEach(() => {
    mockState.tasks = [];
    mockState.toggleComplete.mockClear();
    mockState.reorderTasks.mockClear();
    mockState.createTask.mockClear();
    noteMockState.notes = [];
    noteMockState.update.mockClear();
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
    expect(screen.getAllByText("待办").length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByText("已完成"));
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

  describe("convertNoteToTask（便签 → 今日任务）", () => {
    it("active 便签 → 创建任务并标记 arranged", async () => {
      const notes = [makeNote({ id: 1, title: "设计背包 UI" })];
      const createTask = vi.fn().mockResolvedValue(undefined);
      const updateNote = vi.fn().mockResolvedValue(undefined);
      const ok = await convertNoteToTask(1, notes, createTask, updateNote);
      expect(ok).toBe(true);
      expect(createTask).toHaveBeenCalledWith({
        title: "设计背包 UI",
        categoryId: null,
        scheduledDate: undefined,
        plannedStart: null,
        plannedEnd: null,
      });
      expect(updateNote).toHaveBeenCalledWith(1, { status: "arranged" });
    });

    it("继承便签分类", async () => {
      const notes = [makeNote({ id: 1, title: "A", categoryId: 5 })];
      const createTask = vi.fn().mockResolvedValue(undefined);
      await convertNoteToTask(1, notes, createTask, vi.fn());
      expect(createTask).toHaveBeenCalledWith({
        title: "A",
        categoryId: 5,
        scheduledDate: undefined,
        plannedStart: null,
        plannedEnd: null,
      });
    });

    it("arranged 便签 → 不创建（防重复）", async () => {
      const notes = [makeNote({ id: 1, title: "已安排", status: "arranged" })];
      const createTask = vi.fn();
      const updateNote = vi.fn();
      const ok = await convertNoteToTask(1, notes, createTask, updateNote);
      expect(ok).toBe(false);
      expect(createTask).not.toHaveBeenCalled();
      expect(updateNote).not.toHaveBeenCalled();
    });

    it("未知 id → 不创建", async () => {
      const ok = await convertNoteToTask(999, [], vi.fn(), vi.fn());
      expect(ok).toBe(false);
    });

    it("创建任务失败 → 便签不标记（状态一致）", async () => {
      const notes = [makeNote({ id: 1 })];
      const createTask = vi.fn().mockRejectedValue(new Error("db"));
      const updateNote = vi.fn();
      const ok = await convertNoteToTask(1, notes, createTask, updateNote);
      expect(ok).toBe(false);
      expect(updateNote).not.toHaveBeenCalled();
    });
  });
});
