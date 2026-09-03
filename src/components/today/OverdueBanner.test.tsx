// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import OverdueBanner from "./OverdueBanner";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  overdue: [] as Task[],
  carryOver: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}));

function makeTask(id: number, title: string): Task {
  return {
    id,
    title,
    scheduledDate: "2026-08-26",
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
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("OverdueBanner（昨日未完成结转横幅）", () => {
  beforeEach(() => {
    mockState.overdue = [];
    mockState.carryOver.mockClear();
  });

  it("无逾期时不渲染", () => {
    render(<OverdueBanner />);
    expect(screen.queryByText(/未完成/)).toBeNull();
  });

  it("显示逾期数量与任务标题", () => {
    mockState.overdue = [makeTask(1, "写周报"), makeTask(2, "整理邮件")];
    render(<OverdueBanner />);
    expect(screen.getByText(/昨天有 2 项任务未完成/)).toBeTruthy();
    expect(screen.getByText("写周报")).toBeTruthy();
    expect(screen.getByText("整理邮件")).toBeTruthy();
  });

  it("单项「移到今天」只结转该任务", () => {
    mockState.overdue = [makeTask(1, "写周报"), makeTask(2, "整理邮件")];
    render(<OverdueBanner />);
    const buttons = screen.getAllByText("移到今天");
    fireEvent.click(buttons[0]);
    expect(mockState.carryOver).toHaveBeenCalledWith([1]);
  });

  it("「全部移到今天」传空数组（=全部结转）", () => {
    mockState.overdue = [makeTask(1, "写周报")];
    render(<OverdueBanner />);
    fireEvent.click(screen.getByText("全部移到今天"));
    expect(mockState.carryOver).toHaveBeenCalledWith([]);
  });

  it("超过 5 项时折叠并提示剩余数量", () => {
    mockState.overdue = Array.from({ length: 6 }, (_, i) => makeTask(i + 1, `任务${i + 1}`));
    render(<OverdueBanner />);
    expect(screen.getByText(/还有 1 项/)).toBeTruthy();
  });
});
