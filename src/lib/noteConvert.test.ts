import { describe, it, expect, vi } from "vitest";
import { convertTaskToNote } from "./noteConvert";
import type { Task } from "../db/repositories/taskRepository";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: "学习 UE PCG",
    categoryId: 5,
    status: "TODO",
    estimatedDuration: null,
    plannedStart: null,
    plannedEnd: null,
    actualDuration: 0,
    scheduledDate: "2026-08-27",
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    notes: "备注",
    sortOrder: 0,
    goalId: null,
    repeatRule: "",
    ...overrides,
  };
}

describe("convertTaskToNote（任务 → 便签）", () => {
  it("转换：用任务标题/分类创建便签，删除任务行，返回 true", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 99 });
    const deleteTaskRow = vi.fn().mockResolvedValue(undefined);
    const deleteNote = vi.fn().mockResolvedValue(undefined);
    const ok = await convertTaskToNote(
      1,
      [makeTask()],
      createNote,
      deleteTaskRow,
      deleteNote,
    );
    expect(ok).toBe(true);
    expect(createNote).toHaveBeenCalledWith({ title: "学习 UE PCG", categoryId: 5 });
    expect(deleteTaskRow).toHaveBeenCalledWith(1);
    expect(deleteNote).not.toHaveBeenCalled(); // 无回滚
  });

  it("未知任务 id → 不转换", async () => {
    const createNote = vi.fn();
    const ok = await convertTaskToNote(999, [], createNote, vi.fn(), vi.fn());
    expect(ok).toBe(false);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("创建便签失败 → 不删任务，返回 false", async () => {
    const createNote = vi.fn().mockRejectedValue(new Error("db"));
    const deleteTaskRow = vi.fn();
    const ok = await convertTaskToNote(
      1,
      [makeTask()],
      createNote,
      deleteTaskRow,
      vi.fn(),
    );
    expect(ok).toBe(false);
    expect(deleteTaskRow).not.toHaveBeenCalled();
  });

  it("删除任务失败 → 回滚删除刚创建的便签", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 99 });
    const deleteTaskRow = vi.fn().mockRejectedValue(new Error("db"));
    const deleteNote = vi.fn().mockResolvedValue(undefined);
    const ok = await convertTaskToNote(
      1,
      [makeTask()],
      createNote,
      deleteTaskRow,
      deleteNote,
    );
    expect(ok).toBe(false);
    expect(deleteNote).toHaveBeenCalledWith(99); // 回滚
  });
});
