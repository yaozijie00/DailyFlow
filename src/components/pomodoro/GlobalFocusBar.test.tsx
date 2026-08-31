// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GlobalFocusBar from "./GlobalFocusBar";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useAppStore } from "../../stores/appStore";
import type { PomodoroSnapshot } from "../../lib/pomodoroTimer";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

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
};

beforeEach(() => {
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
});
