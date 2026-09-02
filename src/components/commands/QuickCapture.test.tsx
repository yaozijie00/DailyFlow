// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import QuickCapture from "./QuickCapture";
import { todayString } from "../../lib/date";

afterEach(cleanup);

const mockState = vi.hoisted(() => ({
  categories: [] as { id: number; name: string; color: string }[],
  createScheduledTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}));

function open() {
  fireEvent.keyDown(window, { key: "i", ctrlKey: true, shiftKey: true });
}

describe("QuickCapture（Ctrl+Shift+I 快速捕获）", () => {
  beforeEach(() => {
    mockState.createScheduledTask.mockReset();
    mockState.createScheduledTask.mockResolvedValue(true);
    mockState.categories = [{ id: 1, name: "开发", color: "#888888" }];
  });

  it("快捷键打开，Esc 关闭", () => {
    render(<QuickCapture />);
    expect(screen.queryByPlaceholderText(/快速捕获/)).toBeNull();
    open();
    expect(screen.getByPlaceholderText(/快速捕获/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/快速捕获/)).toBeNull();
  });

  it("纯标题回车创建今天任务", async () => {
    render(<QuickCapture />);
    open();
    fireEvent.change(screen.getByPlaceholderText(/快速捕获/), {
      target: { value: "写设计文档" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/快速捕获/), { key: "Enter" });
    await vi.waitFor(() => {
      expect(mockState.createScheduledTask).toHaveBeenCalledTimes(1);
    });
    const arg = mockState.createScheduledTask.mock.calls[0][0];
    expect(arg.title).toBe("写设计文档");
    expect(arg.scheduledDate).toBe(todayString());
  });

  it("完整语法：解析后创建（明天 14:00 90分钟 #开发）", async () => {
    render(<QuickCapture />);
    open();
    fireEvent.change(screen.getByPlaceholderText(/快速捕获/), {
      target: { value: "明天 14:00 90分钟 #开发 写设计文档" },
    });
    // 预览出现分类与标题
    expect(screen.getByText(/#开发/)).toBeTruthy();
    expect(screen.getByText("写设计文档")).toBeTruthy();

    fireEvent.keyDown(screen.getByPlaceholderText(/快速捕获/), { key: "Enter" });
    await vi.waitFor(() => {
      expect(mockState.createScheduledTask).toHaveBeenCalledTimes(1);
    });
    const arg = mockState.createScheduledTask.mock.calls[0][0];
    expect(arg.title).toBe("写设计文档");
    expect(arg.categoryId).toBe(1);
    expect(arg.estimatedDuration).toBe(5400);
    expect(arg.plannedStart).not.toBeNull();
    expect(arg.plannedEnd).not.toBeNull();
  });
});
