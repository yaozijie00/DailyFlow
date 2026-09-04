// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ReminderRail from "./ReminderRail";
import type { Task } from "../../db/repositories/taskRepository";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  overdue: [] as Task[],
  tasks: [] as Task[],
  carryOver: vi.fn(),
  updateTask: vi.fn(),
  selectTask: vi.fn(),
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
  plannedStart?: number,
  plannedEnd?: number,
  status = "TODO",
): Task {
  return {
    id,
    title,
    scheduledDate: "2026-08-26",
    status,
    categoryId: null,
    estimatedDuration: null,
    plannedStart: plannedStart ?? null,
    plannedEnd: plannedEnd ?? null,
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

const H = 3_600_000;

describe("ReminderRail（今日右侧提醒栏）", () => {
  beforeEach(() => {
    mockState.overdue = [];
    mockState.tasks = [];
    mockState.carryOver.mockClear();
    mockState.updateTask.mockClear();
    mockState.selectTask.mockClear();
    mockState.updateTask.mockResolvedValue(undefined);
    mockState.carryOver.mockResolvedValue(undefined);
  });

  it("无任何提醒时不渲染（不占主区宽度）", () => {
    render(<ReminderRail />);
    expect(screen.queryByLabelText("今日提醒")).toBeNull();
    expect(screen.queryByText("昨日未完成")).toBeNull();
  });

  it("昨日未完成卡：展示任务与「移到今天/全部移到今天」", () => {
    mockState.overdue = [makeTask(1, "写周报"), makeTask(2, "整理邮件")];
    render(<ReminderRail />);
    expect(screen.getByText("昨日未完成")).toBeTruthy();
    expect(screen.getByText("写周报")).toBeTruthy();
    const buttons = screen.getAllByText("移到今天");
    fireEvent.click(buttons[0]);
    expect(mockState.carryOver).toHaveBeenCalledWith([1]);
    fireEvent.click(screen.getByText("全部移到今天"));
    expect(mockState.carryOver).toHaveBeenCalledWith([]);
  });

  it("昨日未完成超过 3 项：默认折叠 + 「还有 N 项」展开", () => {
    mockState.overdue = Array.from({ length: 5 }, (_, i) => makeTask(i + 1, `任务${i + 1}`));
    render(<ReminderRail />);
    expect(screen.getByText(/还有 2 项/)).toBeTruthy();
    expect(screen.queryByText("任务4")).toBeNull();
    fireEvent.click(screen.getByText(/还有 2 项/));
    expect(screen.getByText("任务4")).toBeTruthy();
    expect(screen.getByText("任务5")).toBeTruthy();
  });

  it("时间冲突卡：展示重叠任务并支持「定位」", () => {
    mockState.tasks = [
      makeTask(1, "开发", 9 * H, 11 * H),
      makeTask(2, "会议", 10 * H, 11 * H),
    ];
    render(<ReminderRail />);
    expect(screen.getByText("时间冲突")).toBeTruthy();
    expect(screen.getByText(/「开发」与「会议」/)).toBeTruthy();
    fireEvent.click(screen.getByText("定位"));
    expect(mockState.selectTask).toHaveBeenCalledWith(1);
  });

  it("日程超载卡：展示超载并支持「移到明天」", () => {
    mockState.tasks = [
      makeTask(1, "大任务A", 9 * H, 12.5 * H),
      makeTask(2, "大任务B", 13 * H, 16.5 * H),
      makeTask(3, "大任务C", 17 * H, 20.5 * H),
    ];
    render(<ReminderRail />);
    expect(screen.getByText("日程超载")).toBeTruthy();
    expect(screen.getByText(/超出建议容量/)).toBeTruthy();
    const btns = screen.getAllByText("移到明天");
    fireEvent.click(btns[0]);
    expect(mockState.updateTask).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ scheduledDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });

  it("卡片折叠：仅剩标题一行；展开恢复内容", () => {
    mockState.overdue = [makeTask(1, "写周报")];
    render(<ReminderRail />);
    expect(screen.getByText("写周报")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("折叠提醒"));
    expect(screen.queryByText("写周报")).toBeNull();
    fireEvent.click(screen.getByLabelText("展开提醒"));
    expect(screen.getByText("写周报")).toBeTruthy();
  });

  it("「×」暂时收起：整栏消失，不占宽度", () => {
    mockState.overdue = [makeTask(1, "写周报")];
    render(<ReminderRail />);
    fireEvent.click(screen.getByLabelText("暂时收起昨日未完成提醒"));
    expect(screen.queryByLabelText("今日提醒")).toBeNull();
    expect(screen.queryByText("写周报")).toBeNull();
  });
});
