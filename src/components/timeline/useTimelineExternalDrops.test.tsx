// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../db/repositories/taskRepository";
import { useTimelineExternalDrops } from "./useTimelineExternalDrops";

const currentTask: Task = {
  id: 12,
  title: "拖入时间轴",
  status: "TODO",
  priority: "medium",
  categoryId: null,
  estimatedDuration: 1800,
  plannedStart: null,
  plannedEnd: null,
  actualDuration: 0,
  scheduledDate: "2026-09-09",
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
  notes: null,
  sortOrder: 0,
  goalId: null,
  repeatRule: "",
  projectId: null,
  parentId: null,
  courseId: null,
};

describe("useTimelineExternalDrops", () => {
  const area = document.createElement("div");
  const updateTask = vi.fn(async () => true);
  const endTaskDrag = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(area, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 500,
      bottom: 2160,
      width: 500,
      height: 2160,
      toJSON: () => ({}),
    });
  });

  function setup() {
    return renderHook(() =>
      useTimelineExternalDrops({
        taskAreaRef: { current: area },
        tasks: [currentTask],
        taskDrag: { taskId: currentTask.id },
        notes: [],
        selectedDate: "2026-09-09",
        config: { startMinutes: 480, endMinutes: 1440, snapMinutes: 15 },
        pxPerMinute: 1.5,
        updateTask,
        createTask: vi.fn(async () => true),
        updateNote: vi.fn(async () => undefined),
        endTaskDrag,
      }),
    );
  }

  it("任务列表拖入时先显示预览，松手后才写入计划时间", () => {
    const { result } = setup();
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 50, clientY: 900 })));
    expect(result.current.dropPreview).toEqual(
      expect.objectContaining({ taskId: currentTask.id }),
    );
    expect(updateTask).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new MouseEvent("mouseup", { clientX: 50, clientY: 900 })));
    expect(updateTask).toHaveBeenCalledWith(
      currentTask.id,
      expect.objectContaining({ plannedStart: expect.any(Number), plannedEnd: expect.any(Number) }),
    );
    expect(endTaskDrag).toHaveBeenCalledTimes(1);
  });

  it("卸载后移除全局拖放监听器，不再写任务", () => {
    const { unmount } = setup();
    unmount();
    act(() => window.dispatchEvent(new MouseEvent("mouseup", { clientX: 50, clientY: 900 })));
    expect(updateTask).not.toHaveBeenCalled();
    expect(endTaskDrag).not.toHaveBeenCalled();
  });
});

