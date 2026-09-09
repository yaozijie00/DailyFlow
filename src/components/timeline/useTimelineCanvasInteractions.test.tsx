// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../db/repositories/taskRepository";
import { minutesToY } from "../../lib/timeline";
import { useTimelineCanvasInteractions } from "./useTimelineCanvasInteractions";

function task(overrides: Partial<Task> = {}): Task {
  const day = new Date();
  return {
    id: 7,
    title: "测试任务",
    status: "TODO",
    priority: "medium",
    categoryId: null,
    estimatedDuration: 3600,
    plannedStart: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9).getTime(),
    plannedEnd: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10).getTime(),
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
    ...overrides,
  };
}

function mouse(clientY: number, clientX = 20) {
  return {
    button: 0,
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent;
}

describe("useTimelineCanvasInteractions", () => {
  const openCreate = vi.fn();
  const updateTask = vi.fn();
  const updateSettings = vi.fn();
  let dragHandlers: { onMove: (event: MouseEvent) => void; onUp: (event: MouseEvent) => void };
  let abortDrag: () => void;
  const startWindowDrag = vi.fn((handlers, abort) => {
    dragHandlers = handlers;
    abortDrag = abort;
  });
  const area = document.createElement("div");
  const areaRef = { current: area };

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
      useTimelineCanvasInteractions({
        taskAreaRef: areaRef,
        config: { startMinutes: 480, endMinutes: 1440, snapMinutes: 15 },
        pxPerMinute: 1.5,
        startWindowDrag,
        openCreate,
        updateTask,
        updateSettings,
        getLaneLayout: () => undefined,
      }),
    );
  }

  it("空白区拖拽先预览，松手后打开带时间范围的创建表单", () => {
    const { result } = setup();
    act(() => result.current.handleCanvasMouseDown(mouse(minutesToY(540))));
    act(() => dragHandlers.onMove(mouse(minutesToY(600)) as unknown as MouseEvent));
    expect(result.current.preview).toEqual({ startMinutes: 540, endMinutes: 600 });

    act(() => dragHandlers.onUp(mouse(minutesToY(600)) as unknown as MouseEvent));
    expect(openCreate).toHaveBeenCalledWith({
      plannedStart: expect.any(Number),
      plannedEnd: expect.any(Number),
    });
    expect(result.current.preview).toBeNull();
  });

  it("调整任务结束边缘时同步计划范围与预计秒数", () => {
    const current = task();
    const { result } = setup();
    act(() => result.current.startResize(mouse(minutesToY(600)), current, "end"));
    act(() => dragHandlers.onUp(mouse(minutesToY(630)) as unknown as MouseEvent));

    expect(updateTask).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        plannedStart: current.plannedStart,
        estimatedDuration: 5400,
      }),
    );
    expect(result.current.blockPreview).toBeNull();
  });

  it("任务拖出时间轴后只清空计划时间", () => {
    const current = task();
    const { result } = setup();
    act(() => result.current.startMove(mouse(minutesToY(540)), current));
    act(() => dragHandlers.onUp(mouse(minutesToY(540), 700) as unknown as MouseEvent));
    expect(updateTask).toHaveBeenCalledWith(current.id, {
      plannedStart: null,
      plannedEnd: null,
    });
  });

  it("取消拖拽会清空所有瞬时预览", () => {
    const current = task();
    const { result } = setup();
    act(() => result.current.startMove(mouse(minutesToY(540)), current));
    act(() => dragHandlers.onMove(mouse(minutesToY(570)) as unknown as MouseEvent));
    expect(result.current.blockPreview).not.toBeNull();
    act(() => abortDrag());
    expect(result.current.blockPreview).toBeNull();
    expect(result.current.dragLane).toBeNull();
  });
});

