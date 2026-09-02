// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import GlobalFocusBar from "./GlobalFocusBar";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useAppStore } from "../../stores/appStore";
import type { PomodoroSnapshot } from "../../lib/pomodoroTimer";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function snap(partial: Partial<PomodoroSnapshot> = {}): PomodoroSnapshot {
  return {
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
    ...partial,
  };
}

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
};

beforeEach(() => {
  // 浮条每秒轮询 refresh 会读真实引擎快照，覆盖注入的测试状态 → mock 为 no-op
  vi.spyOn(usePomodoroStore.getState(), "refresh").mockImplementation(() => {});
  usePomodoroStore.setState({
    taskId: null,
    phase: "focus",
    completedFocusCount: 0,
    taskTitle: null,
    showResult: false,
    snapshot: snap(),
  });
  useTaskStore.setState({ tasks: [], categories: [] });
  useAppStore.setState({ currentPage: "today" });
});

describe("GlobalFocusBar", () => {
  it("未运行时（IDLE）不渲染", () => {
    const { container } = render(<GlobalFocusBar />);
    expect(container.firstChild).toBeNull();
  });

  it("专注中显示任务名 / 剩余时间 / 状态 / 暂停与结束按钮", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "RUNNING", elapsedMs: 5 * 60_000, remainingMs: 20 * 60_000 }),
    });
    useTaskStore.setState({ tasks: [task] });
    render(<GlobalFocusBar />);
    expect(screen.getByText("写代码")).toBeTruthy();
    expect(screen.getByText(/专注中/)).toBeTruthy();
    expect(screen.getByText(/20:00/)).toBeTruthy();
    expect(screen.getByLabelText("暂停")).toBeTruthy();
    expect(screen.getByLabelText("结束专注")).toBeTruthy();
    expect(screen.getByText("去专注")).toBeTruthy();
  });

  it("已暂停显示继续按钮，且能跳转 Today", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "PAUSED", elapsedMs: 5 * 60_000, remainingMs: 20 * 60_000 }),
    });
    useTaskStore.setState({ tasks: [task] });
    render(<GlobalFocusBar />);
    expect(screen.getByLabelText("继续")).toBeTruthy();
    expect(screen.getByText(/已暂停/)).toBeTruthy();
  });

  it("休息阶段显示休息中", () => {
    usePomodoroStore.setState({
      phase: "short_break",
      snapshot: snap({ state: "RUNNING", remainingMs: 4 * 60_000 }),
    });
    render(<GlobalFocusBar />);
    expect(screen.getByText("短休息")).toBeTruthy();
    expect(screen.getByText(/休息中/)).toBeTruthy();
  });

  it("点击「去专注」跳转「专注」页（Bug 4：之前错误跳 Today）", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "RUNNING", remainingMs: 20 * 60_000 }),
    });
    useTaskStore.setState({ tasks: [task] });
    render(<GlobalFocusBar />);
    fireEvent.click(screen.getByText("去专注"));
    expect(useAppStore.getState().currentPage).toBe("focus");
  });

  it("点击主体（任务名/倒计时）跳转「专注」页", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "RUNNING", remainingMs: 20 * 60_000 }),
    });
    useTaskStore.setState({ tasks: [task] });
    render(<GlobalFocusBar />);
    fireEvent.click(screen.getByText("写代码"));
    expect(useAppStore.getState().currentPage).toBe("focus");
  });

  it("点击暂停/结束按钮不触发跳转", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "RUNNING", remainingMs: 20 * 60_000 }),
    });
    useTaskStore.setState({ tasks: [task] });
    render(<GlobalFocusBar />);
    useAppStore.setState({ currentPage: "today" });
    fireEvent.click(screen.getByLabelText("暂停"));
    expect(useAppStore.getState().currentPage).toBe("today"); // 未被跳转
    fireEvent.click(screen.getByLabelText("结束专注"));
    expect(useAppStore.getState().currentPage).toBe("today");
  });

  it("会话完成后（COMPLETED）悬浮条隐藏", () => {
    usePomodoroStore.setState({
      taskId: 7,
      phase: "focus",
      snapshot: snap({ state: "COMPLETED", remainingMs: 0 }),
    });
    const { container } = render(<GlobalFocusBar />);
    expect(container.firstChild).toBeNull();
  });
});
