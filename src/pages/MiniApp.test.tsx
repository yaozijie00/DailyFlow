// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import MiniApp from "./MiniApp";
import { useFocusStore } from "../features/focus/focusStore";
import type { FocusRecord } from "../features/focus/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/* ---- 环境 mock：Tauri invoke + DB ---- */

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../services/achievementRuntime", () => ({ evaluateAndNotify: vi.fn() }));
vi.mock("../services/notificationService", () => ({
  scheduleFocusEndNotification: vi.fn(), cancelScheduledFocusEndNotification: vi.fn(),
}));
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ load: vi.fn().mockResolvedValue(undefined) }) },
}));

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
    countTodayStats = vi.fn().mockImplementation(async () => ({ total:taskRows.rows.filter((t) => t.status!=="CANCELLED").length,completed:taskRows.rows.filter((t) => t.status==="COMPLETED").length }));
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

describe("MiniApp", () => {
  beforeEach(() => {
    taskRows.rows = [];
    useFocusStore.setState(useFocusStore.getInitialState(), true);
    vi.spyOn(useFocusStore.getState(), "sync").mockResolvedValue(undefined);
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

  it("共享专注控制器显示已投入时间，支持暂停与继续", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const active: FocusRecord = {
      id: 1, taskId: 7, taskTitle: "编码", startedAt: now - 300_000,
      endedAt: null, actualSeconds: 300, status: "running", runningSince: now,
      pausedAt: null, goalSeconds: 1500, mode: "countdown", note: "", nextAction: "",
      interruptionCount: 0, source: "timer", checkpointAt: now, revision: 1,
    };
    useFocusStore.setState({ active });
    const perform = vi.spyOn(useFocusStore.getState(), "perform").mockResolvedValue(true);
    render(<MiniApp />);
    await waitFor(() => expect(screen.queryByText("加载中…")).toBeNull());
    expect(screen.getByText("编码")).toBeTruthy();
    expect(screen.getByLabelText("本次已投入").textContent).toBe("05:00");
    expect(screen.queryByText("20:00")).toBeNull();
    const pauseBtn = screen.getByRole("button", { name: "暂停" });
    fireEvent.click(pauseBtn);
    expect(perform).toHaveBeenCalledWith({ action: "pause" });
    act(() => useFocusStore.setState({ active: { ...active, status: "paused", runningSince: null, pausedAt: now } }));
    const resumeBtn = await screen.findByRole("button", { name: "继续" });
    fireEvent.click(resumeBtn);
    expect(perform).toHaveBeenLastCalledWith({ action: "resume" });
  });

  it("标题条：返回主窗口触发 close_mini_window", async () => {
    render(<MiniApp />);
    await waitFor(() => expect(screen.queryByText("加载中…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "返回主窗口" }));
    expect(invokeMock).toHaveBeenCalledWith("close_mini_window");
  });
});
