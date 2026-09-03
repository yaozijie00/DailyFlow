// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DayPlanWarnings from "./DayPlanWarnings";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  tasks: [] as Task[],
  updateTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}));

function makeTask(
  id: number,
  title: string,
  plannedStart: number,
  plannedEnd: number,
  status = "TODO",
): Task {
  return {
    id,
    title,
    scheduledDate: "2026-09-28",
    status,
    categoryId: null,
    estimatedDuration: null,
    plannedStart,
    plannedEnd,
    actualDuration: 0,
    completedAt: null,
    notes: null,
    goalId: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    repeatRule: "",
    projectId: null,
    parentId: null,
  };
}

const base = new Date(2026, 8, 28, 0, 0).getTime();

describe("DayPlanWarnings（时间冲突 / 日程超载）", () => {
  beforeEach(() => {
    mockState.tasks = [];
    mockState.updateTask.mockClear();
    mockState.updateTask.mockResolvedValue(undefined);
  });

  it("无冲突且未超载时不渲染", () => {
    mockState.tasks = [
      makeTask(1, "A", base + 9 * 3_600_000, base + 10 * 3_600_000),
      makeTask(2, "B", base + 11 * 3_600_000, base + 12 * 3_600_000),
    ];
    render(<DayPlanWarnings />);
    expect(screen.queryByText(/时间冲突/)).toBeNull();
    expect(screen.queryByText(/超出建议容量/)).toBeNull();
  });

  it("检测时间重叠并提示", () => {
    mockState.tasks = [
      makeTask(1, "开发", base + 9 * 3_600_000, base + 11 * 3_600_000),
      makeTask(2, "会议", base + 10 * 3_600_000, base + 11 * 3_600_000),
    ];
    render(<DayPlanWarnings />);
    expect(screen.getByText(/时间冲突（1 处）/)).toBeTruthy();
    expect(screen.getByText(/「开发」与「会议」时间段重叠/)).toBeTruthy();
  });

  it("已完成/无计划任务不参与冲突", () => {
    mockState.tasks = [
      makeTask(1, "开发", base + 9 * 3_600_000, base + 11 * 3_600_000),
      makeTask(2, "已完成会议", base + 10 * 3_600_000, base + 11 * 3_600_000, "COMPLETED"),
      makeTask(3, "无计划", base, base),
    ];
    // 无 planned 的任务（plannedStart==plannedEnd）不应产生冲突
    mockState.tasks[2].plannedStart = null;
    mockState.tasks[2].plannedEnd = null;
    render(<DayPlanWarnings />);
    expect(screen.queryByText(/时间冲突/)).toBeNull();
  });

  it("计划超载提示 + 「移到明天」改日期", () => {
    const dayMs = 86_400_000;
    // 3 × 3.5h = 630 分钟 > 480
    mockState.tasks = [
      makeTask(1, "大任务A", base + 9 * 3_600_000, base + 12.5 * 3_600_000),
      makeTask(2, "大任务B", base + 13 * 3_600_000, base + 16.5 * 3_600_000),
      makeTask(3, "大任务C", base + 17 * 3_600_000, base + 20.5 * 3_600_000),
    ];
    render(<DayPlanWarnings />);
    expect(screen.getByText(/超出建议容量/)).toBeTruthy();
    const buttons = screen.getAllByText("移到明天");
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(mockState.updateTask).toHaveBeenCalledWith(1, { scheduledDate: ymd });
    void dayMs;
  });
});
