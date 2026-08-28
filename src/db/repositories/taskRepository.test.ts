import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { TaskRepository } from "./taskRepository";
import { CategoryRepository } from "./categoryRepository";

describe("TaskRepository", () => {
  let db: Db;
  let close: () => void;
  let tasks: TaskRepository;
  let categories: CategoryRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    tasks = new TaskRepository(db);
    categories = new CategoryRepository(db);
  });

  afterEach(() => close());

  it("creates a task with default TODO status", async () => {
    const task = await tasks.create({ title: "写代码", scheduledDate: "2026-08-27" });
    expect(task.id).toBeGreaterThan(0);
    expect(task.title).toBe("写代码");
    expect(task.status).toBe("TODO");
    expect(task.actualDuration).toBe(0);
    expect(task.scheduledDate).toBe("2026-08-27");
  });

  it("finds a task by id", async () => {
    const task = await tasks.create({ title: "写代码", scheduledDate: "2026-08-27" });
    const found = await tasks.findById(task.id);
    expect(found?.title).toBe("写代码");
  });

  it("returns null when task not found", async () => {
    expect(await tasks.findById(9999)).toBeNull();
  });

  it("filters tasks by scheduled date", async () => {
    await tasks.create({ title: "A", scheduledDate: "2026-08-27" });
    await tasks.create({ title: "B", scheduledDate: "2026-08-28" });
    const todays = await tasks.findByDate("2026-08-27");
    expect(todays.map((t) => t.title)).toEqual(["A"]);
  });

  it("updates a task", async () => {
    const task = await tasks.create({ title: "写代码", scheduledDate: "2026-08-27" });
    const updated = await tasks.update(task.id, {
      title: "改标题",
      status: "IN_PROGRESS",
    });
    expect(updated?.title).toBe("改标题");
    expect(updated?.status).toBe("IN_PROGRESS");
  });

  it("deletes a task", async () => {
    const task = await tasks.create({ title: "写代码", scheduledDate: "2026-08-27" });
    expect(await tasks.delete(task.id)).toBe(true);
    expect(await tasks.findById(task.id)).toBeNull();
  });

  it("associates a task with a category", async () => {
    const cat = await categories.create("开发");
    const task = await tasks.create({
      title: "写代码",
      scheduledDate: "2026-08-27",
      categoryId: cat.id,
    });
    expect(task.categoryId).toBe(cat.id);
  });

  it("rejects a task referencing a non-existent category (FK)", async () => {
    await expect(
      tasks.create({ title: "孤儿任务", scheduledDate: "2026-08-27", categoryId: 9999 }),
    ).rejects.toThrow();
  });

  describe("countTodayStats", () => {
    it("统计今日任务总数与完成数（含已取消，与列表口径一致）", async () => {
      await tasks.create({ title: "A", scheduledDate: "2026-08-27" });
      await tasks.create({ title: "B", scheduledDate: "2026-08-27", status: "COMPLETED" });
      await tasks.create({ title: "C", scheduledDate: "2026-08-27", status: "CANCELLED" });
      await tasks.create({ title: "D", scheduledDate: "2026-08-28" });

      const stats = await tasks.countTodayStats("2026-08-27");
      expect(stats.total).toBe(3); // A、B、C
      expect(stats.completed).toBe(1); // B
    });

    it("无任务时返回 0", async () => {
      const stats = await tasks.countTodayStats("2026-08-27");
      expect(stats).toEqual({ total: 0, completed: 0 });
    });
  });
});
