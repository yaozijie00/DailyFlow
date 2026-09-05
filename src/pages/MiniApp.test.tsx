// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import MiniApp from "./MiniApp";

afterEach(cleanup);

/* ---- 环境 mock：Tauri invoke + DB + pomodoroStore + 时间 ---- */

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

// 任务数据层：直接 mock repository 查询结果，避免真实 SQLite
const taskRows = vi.hoisted(() => ({
  rows: [] as Array<{
    id: number;
    title: string;
    plannedStart: number | null;
    status: string;
    priority: string;
  }>,
}));

vi.mock("../db/db", () => ({
  getDb: () => ({}),
}));

vi.mock("../db/repositories/taskRepository", () => ({
  TaskRepository: class {
    findByDate = vi.fn().mockImplementation(async () => taskRows.rows);
    findById = vi.fn().mockResolvedValue(null);
    create = vi.fn().mockImplementation(async (input: { title: string }) => ({
      id: 999,
      ...input,
      status: "TODO",
      priority: "medium",
      plannedStart: null,
    }));
    reorderByTime = vi.fn().mockResolvedValue(undefined);
    update = vi.fn();
    deleteTask = vi.fn();
  },
}));

vi.mock("../db/repositories/focusSessionRepository", () => ({
  FocusSessionRepository: class {},
}));

const pomodoroState = vi.hoisted(() => ({
  snapshot: { state: "IDLE", remainingMs: 0, durationMs: 0, elapsedMs: 0 },
  phase: "focus",
  taskTitle: null as string | null,
  taskId: null as number | null,
  pause: vi.fn(),
  resume: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../stores/pomodoroStore", () => ({
  usePomodoroStore: (selector: (s: unknown) => unknown) => selector(pomodoroState),
}));

describe("MiniApp（V2.4 重设计）", () => {
  beforeEach(() => {
    taskRows.rows = [];
    pomodoroState.snapshot = { state: "IDLE", remainingMs: 0, durationMs: 0, elapsedMs: 0 };
    pomodoroState.taskId = null;
    pomodoroState.taskTitle = null;
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined); // 所有 invoke 返回 resolved Promise（组件 .catch 链安全）
  });

  it("空状态：提示可快速添加", async () => {
    render(<MiniApp />);
    await waitFor(() => expect(screen.queryByText("加载中…")).toBeNull());
    expect(screen.getByText(/今天没有任务/)).toBeTruthy();
    // 标题条含「今日」日期（圆点 span 会分割文本，用函数匹配器）
    expect(
      screen.getByText((content) => content.includes("今日") && content.includes("·")),
    ).toBeTruthy();
  });

  it("渲染任务列表：任务名/时间/优先级/完成按钮", async () => {
    taskRows.rows = [
      { id: 1, title: "写周报", plannedStart: new Date(2026, 0, 1, 9, 30).getTime(), status: "TODO", priority: "high" },
      { id: 2, title: "读文档", plannedStart: null, status: "COMPLETED", priority: "medium" },
    ];
    render(<MiniApp />);
    await waitFor(() => expect(screen.getByText("写周报")).toBeTruthy());
    expect(screen.getByText("09:30")).toBeTruthy();
    // 已完成任务划线（文本仍在）
    expect(screen.getByText("读文档")).toBeTruthy();
    expect(screen.getByText(/高/)).toBeTruthy();
  });

  it("快加：回车创建任务并清空输入", async () => {
    render(<MiniApp />);
    await waitFor(() => expect(screen.queryByText("加载中…")).toBeNull());
    const input = screen.getByPlaceholderText(/快速添加今日任务/);
    fireEvent.change(input, { target: { value: "新任务A" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
    // 创建后应广播 tasks-changed（invoke notify_tasks_changed）
    expect(invokeMock).toHaveBeenCalledWith("notify_tasks_changed");
  });

  it("专注运行中显示剩余时间与暂停按钮；暂停后变为继续", async () => {
    pomodoroState.snapshot = {
      state: "RUNNING",
      remainingMs: 25 * 60_000,
      durationMs: 25 * 60_000,
      elapsedMs: 0,
    };
    pomodoroState.taskTitle = "编码";
    render(<MiniApp />);
    // 剩余 25:00
    expect(screen.getByText("25:00")).toBeTruthy();
    const pauseBtn = screen.getByRole("button", { name: "暂停" });
    fireEvent.click(pauseBtn);
    expect(pomodoroState.pause).toHaveBeenCalled();
    // 暂停态切换按钮文案
    pomodoroState.snapshot = { ...pomodoroState.snapshot, state: "PAUSED" };
    cleanup();
    render(<MiniApp />);
    const resumeBtn = await screen.findByRole("button", { name: "继续" });
    fireEvent.click(resumeBtn);
    expect(pomodoroState.resume).toHaveBeenCalled();
  });

  it("标题条：返回主窗口触发 close_mini_window", async () => {
    render(<MiniApp />);
    await waitFor(() => expect(screen.queryByText("加载中…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "返回主窗口" }));
    expect(invokeMock).toHaveBeenCalledWith("close_mini_window");
  });
});
