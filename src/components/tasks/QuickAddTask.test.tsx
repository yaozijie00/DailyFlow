// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import QuickAddTask from "./QuickAddTask";

const mockState = vi.hoisted(() => ({
  createTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));

afterEach(cleanup);

describe("QuickAddTask（仅标题快速创建）", () => {
  beforeEach(() => {
    mockState.createTask.mockClear();
  });

  it("输入标题回车创建任务（仅标题）", async () => {
    render(<QuickAddTask />);
    const input = screen.getByPlaceholderText("快速添加任务，回车创建");
    fireEvent.change(input, { target: { value: "写代码" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(mockState.createTask).toHaveBeenCalledWith({ title: "写代码" }),
    );
  });

  it("空标题不可提交（按钮禁用）", () => {
    render(<QuickAddTask />);
    const btn = screen.getByLabelText("添加任务") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("快速添加任务，回车创建"), {
      target: { value: "写代码" },
    });
    expect(btn.disabled).toBe(false);
  });
});
