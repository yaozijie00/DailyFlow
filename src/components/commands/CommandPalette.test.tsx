// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import CommandPalette from "./CommandPalette";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const appState = vi.hoisted(() => ({ setPage: vi.fn() }));
const taskState = vi.hoisted(() => ({
  openCreate: vi.fn(),
  setSelectedDate: vi.fn(),
  selectTask: vi.fn(),
  searchTasks: vi.fn(),
}));
const statsState = vi.hoisted(() => ({ setTab: vi.fn() }));
const goalServiceMock = vi.hoisted(() => ({ searchTitles: vi.fn() }));
const noteServiceMock = vi.hoisted(() => ({ searchTitles: vi.fn() }));

vi.mock("../../stores/appStore", () => ({
  useAppStore: { getState: () => appState },
}));
vi.mock("../../stores/taskStore", () => ({
  useTaskStore: { getState: () => taskState },
}));
vi.mock("../../stores/statisticsStore", () => ({
  useStatisticsStore: { getState: () => statsState },
}));
vi.mock("../../stores/goalStore", () => ({ goalService: goalServiceMock }));
vi.mock("../../stores/noteStore", () => ({ noteService: noteServiceMock }));

function makeTask(id: number, title: string, scheduledDate = "2026-08-27"): Task {
  return {
    id,
    title,
    scheduledDate,
    status: "TODO",
    categoryId: null,
    estimatedDuration: null,
    plannedStart: null,
    plannedEnd: null,
    actualDuration: 0,
    completedAt: null,
    notes: null,
    goalId: null,
    repeatRule: "",
    projectId: null,
    parentId: null,
    courseId: null,
    priority: "medium",
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
}

describe("CommandPalette（Ctrl+K 命令面板）", () => {
  beforeEach(() => {
    appState.setPage.mockClear();
    taskState.openCreate.mockClear();
    taskState.setSelectedDate.mockClear();
    taskState.selectTask.mockClear();
    taskState.searchTasks.mockReset();
    taskState.searchTasks.mockResolvedValue([]);
    statsState.setTab.mockClear();
    goalServiceMock.searchTitles.mockReset();
    goalServiceMock.searchTitles.mockResolvedValue([]);
    noteServiceMock.searchTitles.mockReset();
    noteServiceMock.searchTitles.mockResolvedValue([]);
  });

  it("Ctrl+K 打开，Esc 关闭", () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/跳转页面/)).toBeNull();
    openPalette();
    expect(screen.getByPlaceholderText(/跳转页面/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/跳转页面/)).toBeNull();
  });

  it("点击「打开长期」跳转长期页", () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText("打开长期"));
    expect(appState.setPage).toHaveBeenCalledWith("goals");
    // 选中后自动关闭
    expect(screen.queryByPlaceholderText(/跳转页面/)).toBeNull();
  });

  it("「新建任务」跳到今日并打开新建", () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(screen.getByText("新建任务"));
    expect(appState.setPage).toHaveBeenCalledWith("today");
    expect(taskState.openCreate).toHaveBeenCalled();
  });

  it("输入关键词防抖搜索任务，点击结果跳到对应日期并选中", async () => {
    vi.useFakeTimers();
    taskState.searchTasks.mockResolvedValue([makeTask(7, "写周报")]);
    render(<CommandPalette />);
    openPalette();

    fireEvent.change(screen.getByPlaceholderText(/跳转页面/), {
      target: { value: "周报" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(taskState.searchTasks).toHaveBeenCalledWith("周报");
    expect(screen.getByText("写周报")).toBeTruthy();

    fireEvent.click(screen.getByText("写周报"));
    expect(taskState.setSelectedDate).toHaveBeenCalledWith("2026-08-27");
    expect(taskState.selectTask).toHaveBeenCalledWith(7);
    expect(appState.setPage).toHaveBeenCalledWith("today");
  });

  it("无匹配结果时给出提示", async () => {
    vi.useFakeTimers();
    render(<CommandPalette />);
    openPalette();
    fireEvent.change(screen.getByPlaceholderText(/跳转页面/), {
      target: { value: "不存在的任务xyz" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByText("没有匹配的结果")).toBeTruthy();
  });

  it("目标搜索结果点击跳转长期页", async () => {
    vi.useFakeTimers();
    goalServiceMock.searchTitles.mockResolvedValue([
      { id: 3, title: "学习 Unreal", status: "active" },
    ] as never);
    render(<CommandPalette />);
    openPalette();
    fireEvent.change(screen.getByPlaceholderText(/跳转页面/), {
      target: { value: "Unreal" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(goalServiceMock.searchTitles).toHaveBeenCalledWith("Unreal");
    fireEvent.click(screen.getByText("学习 Unreal"));
    expect(appState.setPage).toHaveBeenCalledWith("goals");
  });
});
