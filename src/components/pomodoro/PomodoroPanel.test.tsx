// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PomodoroPanel from "./PomodoroPanel";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const task: Task = {
  id: 7,
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
  repeatRule: "",
  projectId: null,
  parentId: null,
};

beforeEach(() => {
  // 面板每秒轮询 refresh 会读真实引擎快照，覆盖注入的测试状态 → mock 为 no-op
  vi.spyOn(usePomodoroStore.getState(), "refresh").mockImplementation(() => {});
  usePomodoroStore.setState({
    taskId: null,
    phase: "focus",
    completedFocusCount: 0,
    focusCountGoal: 4,
    taskTitle: null,
    showResult: false,
    snapshot: {
      state: "IDLE",
      durationMs: 25 * 60_000,
      elapsedMs: 0,
      remainingMs: 25 * 60_000,
      progress: 0,
      startedAt: null,
      pausedAt: null,
      totalPausedDurationMs: 0,
      completedAt: null,
      cancelledAt: null,
    },
  });
  useTaskStore.setState({ tasks: [task], categories: [] });
  useSettingsStore.setState({
    settings: { ...useSettingsStore.getState().settings, pomodoroDurationMinutes: 25 },
  });
});

describe("PomodoroPanel 时长与番茄目标设置", () => {
  it("IDLE 时渲染滑块 / 分钟数 / 番茄目标 / 增减按钮", () => {
    render(<PomodoroPanel />);
    expect(screen.getByLabelText("专注时长滑块")).toBeTruthy();
    expect(screen.getByText("25 分钟")).toBeTruthy();
    expect(screen.getByLabelText("番茄目标")).toBeTruthy();
    expect(screen.getByLabelText("减少番茄目标")).toBeTruthy();
    expect(screen.getByLabelText("增加番茄目标")).toBeTruthy();
    expect(screen.getByText(/目标 4 个/)).toBeTruthy();
  });

  it("点击分钟数进入输入框，Enter 合法值更新设置（Settings 同源）", () => {
    const updateSpy = vi
      .spyOn(useSettingsStore.getState(), "update")
      .mockResolvedValue(undefined);
    render(<PomodoroPanel />);
    fireEvent.click(screen.getByText("25 分钟"));
    const input = screen.getByLabelText("专注时长分钟数") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(updateSpy).toHaveBeenCalledWith({ pomodoroDurationMinutes: 45 });
    // 输入框关闭，回到显示
    expect(screen.queryByLabelText("专注时长分钟数")).toBeNull();
  });

  it("Enter 非法值（越界 10）不保存，输入框关闭", () => {
    const updateSpy = vi
      .spyOn(useSettingsStore.getState(), "update")
      .mockResolvedValue(undefined);
    render(<PomodoroPanel />);
    fireEvent.click(screen.getByText("25 分钟"));
    const input = screen.getByLabelText("专注时长分钟数") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("专注时长分钟数")).toBeNull();
    expect(screen.getByText("25 分钟")).toBeTruthy(); // 保持原值
  });

  it("Enter 非数字不保存", () => {
    const updateSpy = vi
      .spyOn(useSettingsStore.getState(), "update")
      .mockResolvedValue(undefined);
    render(<PomodoroPanel />);
    fireEvent.click(screen.getByText("25 分钟"));
    const input = screen.getByLabelText("专注时长分钟数") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("ESC 取消编辑，不保存", () => {
    const updateSpy = vi
      .spyOn(useSettingsStore.getState(), "update")
      .mockResolvedValue(undefined);
    render(<PomodoroPanel />);
    fireEvent.click(screen.getByText("25 分钟"));
    const input = screen.getByLabelText("专注时长分钟数") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("专注时长分钟数")).toBeNull();
  });

  it("增减番茄目标（夹取 1..12）", () => {
    render(<PomodoroPanel />);
    fireEvent.click(screen.getByLabelText("增加番茄目标"));
    expect(usePomodoroStore.getState().focusCountGoal).toBe(5);
    fireEvent.click(screen.getByLabelText("减少番茄目标"));
    fireEvent.click(screen.getByLabelText("减少番茄目标"));
    expect(usePomodoroStore.getState().focusCountGoal).toBe(3);
  });
});

describe("PomodoroPanel 规划时间约束（Batch 2C）", () => {
  function ts(h: number, m = 0): number {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
  }

  function selectTaskAndStart() {
    render(<PomodoroPanel />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "7" } });
    fireEvent.click(screen.getByText(/开始（25 分钟）/));
  }

  it("剩余 60min / Focus 25min → 不弹窗直接开始", () => {
    const startSpy = vi
      .spyOn(usePomodoroStore.getState(), "startFocus")
      .mockImplementation(() => {});
    useTaskStore.setState({
      tasks: [
        {
          ...task,
          plannedStart: ts(10, 0),
          plannedEnd: ts(11, 30), // 90min
          actualDuration: 30 * 60, // 已投入 30min → 剩余 60min
        },
      ],
      categories: [],
    });
    selectTaskAndStart();
    expect(startSpy).toHaveBeenCalledWith(7, 25 * 60_000);
    expect(screen.queryByText("仍然开始")).toBeNull();
  });

  it("剩余 15min / Focus 25min → 不弹确认框，直接按用户时长开始（v1.6 用户自选）", () => {
    const startSpy = vi
      .spyOn(usePomodoroStore.getState(), "startFocus")
      .mockImplementation(() => {});
    useTaskStore.setState({
      tasks: [
        {
          ...task,
          plannedStart: ts(10, 0),
          plannedEnd: ts(11, 30), // 90min
          actualDuration: 75 * 60, // 剩余 15min
        },
      ],
      categories: [],
    });
    selectTaskAndStart();
    expect(startSpy).toHaveBeenCalledWith(7, 25 * 60_000);
    expect(screen.queryByText("仍然开始")).toBeNull();
    expect(screen.queryByText(/当前 Focus/)).toBeNull();
  });

  it("规划时间已用完 → 仍直接按用户时长开始（不限制）", () => {
    const startSpy = vi
      .spyOn(usePomodoroStore.getState(), "startFocus")
      .mockImplementation(() => {});
    useTaskStore.setState({
      tasks: [
        {
          ...task,
          plannedStart: ts(10, 0),
          plannedEnd: ts(11, 0), // 60min
          actualDuration: 70 * 60, // 已超 10min
        },
      ],
      categories: [],
    });
    selectTaskAndStart();
    expect(startSpy).toHaveBeenCalledWith(7, 25 * 60_000);
    expect(screen.queryByText(/仍然开始/)).toBeNull();
  });

  it("运行中显示「重新选择」按钮（可返回任务选择，不完成任务）", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: {
        state: "RUNNING",
        durationMs: 25 * 60_000,
        elapsedMs: 60_000,
        remainingMs: 24 * 60_000,
        progress: 0.04,
        startedAt: 0,
        pausedAt: null,
        totalPausedDurationMs: 0,
        completedAt: null,
        cancelledAt: null,
      },
    });
    render(<PomodoroPanel />);
    expect(screen.getByText("重新选择")).toBeTruthy();
  });
});
