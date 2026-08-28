// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import QuickAddTask from "./QuickAddTask";

const mockState = vi.hoisted(() => ({
  categories: [],
  createTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));

afterEach(cleanup);

describe("QuickAddTask", () => {
  beforeEach(() => {
    mockState.createTask.mockClear();
  });

  it("输入标题回车创建任务（无分类/无时长）", async () => {
    render(<QuickAddTask />);
    const input = screen.getByPlaceholderText("快速添加任务，回车创建");
    fireEvent.change(input, { target: { value: "写代码" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() =>
      expect(mockState.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "写代码", categoryId: null, estimatedDuration: null }),
      ),
    );
  });
});
