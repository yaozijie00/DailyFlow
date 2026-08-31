import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { TaskService } from "./taskService";
import { todayString } from "../lib/date";

describe("TaskService", () => {
  let db: Db;
  let close: () => void;
  let service: TaskService;
  let categories: CategoryRepository;
  let sessions: FocusSessionRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    sessions = new FocusSessionRepository(db);
    service = new TaskService(new TaskRepository(db), sessions);
    categories = new CategoryRepository(db);
  });

  afterEach(() => close());

  it("creates a task with today's date by default", async () => {
    const task = await service.createTask({ title: "写代码" });
    expect(task.title).toBe("写代码");
    expect(task.scheduledDate).toBe(todayString());
    expect(task.status).toBe("TODO");
  });

  it("gets today's tasks only", async () => {
    const today = todayString();
    const yd = new Date();
    yd.setDate(yd.getDate() - 1);
    const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;
    await service.createTask({ title: "今天", scheduledDate: today });
    await service.createTask({ title: "昨天", scheduledDate: yesterday });
    const tasks = await service.getTodayTasks();
    expect(tasks.map((t) => t.title)).toEqual(["今天"]);
  });

  it("getTasksByDate 按指定日期查询，不串日期", async () => {
    await service.createTask({ title: "A", scheduledDate: "2026-08-25" });
    await service.createTask({ title: "B", scheduledDate: "2026-08-25" });
    await service.createTask({ title: "C", scheduledDate: "2026-08-26" });
    const aug25 = await service.getTasksByDate("2026-08-25");
    expect(aug25.map((t) => t.title).sort()).toEqual(["A", "B"]);
    const aug26 = await service.getTasksByDate("2026-08-26");
    expect(aug26.map((t) => t.title)).toEqual(["C"]);
  });

  it("updates a task", async () => {
    const task = await service.createTask({ title: "写代码" });
    const updated = await service.updateTask(task.id, { title: "改标题" });
    expect(updated?.title).toBe("改标题");
  });

  it("deletes a task", async () => {
    const task = await service.createTask({ title: "写代码" });
    expect(await service.deleteTask(task.id)).toBe(true);
    const tasks = await service.getTodayTasks();
    expect(tasks).toHaveLength(0);
  });

  it("删除任务时清理其专注记录（统计数据不再包含该任务）", async () => {
    const task = await service.createTask({ title: "写代码" });
    await sessions.create({
      taskId: task.id,
      plannedDuration: 1500,
      startedAt: Date.now(),
      actualDuration: 900,
      completed: true,
    });
    await sessions.create({
      taskId: task.id,
      plannedDuration: 1500,
      startedAt: Date.now() + 1000,
      actualDuration: 600,
      completed: false,
    });
    await service.deleteTask(task.id);
    expect(await sessions.findByTaskId(task.id)).toHaveLength(0);
  });

  it("completes a task with completedAt timestamp", async () => {
    const task = await service.createTask({ title: "写代码" });
    const completed = await service.completeTask(task.id);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).not.toBeNull();
  });

  it("toggleComplete：已完成 → 恢复 TODO 并清空完成时间", async () => {
    const task = await service.createTask({ title: "写代码" });
    await service.completeTask(task.id);
    const restored = await service.toggleComplete(task.id);
    expect(restored?.status).toBe("TODO");
    expect(restored?.completedAt).toBeNull();
  });

  it("toggleComplete：未完成 → 完成", async () => {
    const task = await service.createTask({ title: "写代码" });
    const completed = await service.toggleComplete(task.id);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).not.toBeNull();
  });

  it("cancels a task", async () => {
    const task = await service.createTask({ title: "写代码" });
    const cancelled = await service.cancelTask(task.id);
    expect(cancelled?.status).toBe("CANCELLED");
  });

  it("changes a task's category", async () => {
    const cat = await categories.create("开发");
    const task = await service.createTask({ title: "写代码" });
    const updated = await service.changeCategory(task.id, cat.id);
    expect(updated?.categoryId).toBe(cat.id);
  });

  it("clears a task's category", async () => {
    const cat = await categories.create("开发");
    const task = await service.createTask({ title: "写代码", categoryId: cat.id });
    const updated = await service.changeCategory(task.id, null);
    expect(updated?.categoryId).toBeNull();
  });

  it("changes a task's estimated duration", async () => {
    const task = await service.createTask({ title: "写代码" });
    const updated = await service.changeEstimatedDuration(task.id, 5400);
    expect(updated?.estimatedDuration).toBe(5400);
  });
});
