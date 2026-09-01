import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  UndoManager,
  undoManager,
  diffTaskUpdate,
  TASK_UNDOABLE_FIELDS,
} from "./undoManager";
import type { Task } from "../db/repositories/taskRepository";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "任务",
    categoryId: null,
    status: "TODO",
    estimatedDuration: null,
    plannedStart: 9 * 3_600_000,
    plannedEnd: 10 * 3_600_000,
    actualDuration: 0,
    scheduledDate: "2026-08-27",
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    notes: null,
    sortOrder: 0,
    goalId: null,
    ...overrides,
  };
}

describe("UndoManager（撤销栈）", () => {
  let manager: UndoManager;

  beforeEach(() => {
    manager = new UndoManager();
  });

  it("push/undo/redo 按 LIFO 顺序", async () => {
    const order: string[] = [];
    manager.push({
      type: "a",
      label: "A",
      undo: () => {
        order.push("undo A");
      },
      redo: () => {
        order.push("redo A");
      },
    });
    manager.push({
      type: "b",
      label: "B",
      undo: () => {
        order.push("undo B");
      },
      redo: () => {
        order.push("redo B");
      },
    });
    expect(manager.canUndo()).toBe(true);
    await manager.undo();
    expect(order).toEqual(["undo B"]);
    await manager.undo();
    expect(order).toEqual(["undo B", "undo A"]);
    expect(manager.canUndo()).toBe(false);
    await manager.redo();
    expect(order).toEqual(["undo B", "undo A", "redo A"]);
    await manager.redo();
    expect(order).toEqual(["undo B", "undo A", "redo A", "redo B"]);
    expect(manager.canRedo()).toBe(false);
  });

  it("push 新动作清空 redo 栈", async () => {
    manager.push({ type: "a", label: "A", undo: () => {}, redo: () => {} });
    await manager.undo();
    expect(manager.canRedo()).toBe(true);
    manager.push({ type: "b", label: "B", undo: () => {}, redo: () => {} });
    expect(manager.canRedo()).toBe(false);
    expect(manager.undoSize).toBe(1);
  });

  it("undo/redo 支持异步动作并 await 完成", async () => {
    const done: string[] = [];
    manager.push({
      type: "a",
      label: "A",
      undo: async () => {
        await Promise.resolve();
        done.push("undo done");
      },
      redo: async () => {
        await Promise.resolve();
        done.push("redo done");
      },
    });
    await manager.undo();
    await manager.redo();
    expect(done).toEqual(["undo done", "redo done"]);
  });

  it("undo/redo 应用期间 applying=true（业务层据此跳过入栈）", async () => {
    const seen: boolean[] = [];
    manager.push({
      type: "a",
      label: "A",
      undo: async () => {
        seen.push(manager.applying);
        await Promise.resolve();
        seen.push(manager.applying);
      },
      redo: () => {},
    });
    await manager.undo();
    expect(seen).toEqual([true, true]);
    expect(manager.applying).toBe(false);
  });

  it("空栈 undo/redo 返回 false 且不报错", async () => {
    expect(await manager.undo()).toBe(false);
    expect(await manager.redo()).toBe(false);
  });

  it("clear 清空两个栈", async () => {
    manager.push({ type: "a", label: "A", undo: () => {}, redo: () => {} });
    manager.clear();
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
  });
});

describe("diffTaskUpdate（仅返回变化的可撤销字段）", () => {
  it("返回前后有差异的字段", () => {
    const before = makeTask({ plannedStart: 9 * 3_600_000, plannedEnd: 10 * 3_600_000 });
    const after = makeTask({ plannedStart: 11 * 3_600_000, plannedEnd: 12 * 3_600_000 });
    expect(diffTaskUpdate(before, after)).toEqual({
      plannedStart: 11 * 3_600_000,
      plannedEnd: 12 * 3_600_000,
    });
  });

  it("排除派生字段 sortOrder / actualDuration", () => {
    const before = makeTask({ sortOrder: 0, actualDuration: 0 });
    const after = makeTask({ sortOrder: 5, actualDuration: 900 });
    expect(diffTaskUpdate(before, after)).toEqual({});
    expect(TASK_UNDOABLE_FIELDS).not.toContain("sortOrder");
    expect(TASK_UNDOABLE_FIELDS).not.toContain("actualDuration");
  });

  it("覆盖状态/完成时间等可撤销字段", () => {
    const before = makeTask({ status: "TODO", completedAt: null });
    const after = makeTask({ status: "COMPLETED", completedAt: 1234 });
    const d = diffTaskUpdate(before, after);
    expect(d.status).toBe("COMPLETED");
    expect(d.completedAt).toBe(1234);
  });

  it("null 入参返回空对象", () => {
    expect(diffTaskUpdate(null, makeTask())).toEqual({});
    expect(diffTaskUpdate(makeTask(), undefined)).toEqual({});
  });
});

describe("undoManager 单例", () => {
  beforeEach(() => undoManager.clear());

  it("全局单例可用且可清空", () => {
    undoManager.push({ type: "t", label: "T", undo: vi.fn(), redo: vi.fn() });
    expect(undoManager.canUndo()).toBe(true);
    undoManager.clear();
    expect(undoManager.canUndo()).toBe(false);
  });
});
