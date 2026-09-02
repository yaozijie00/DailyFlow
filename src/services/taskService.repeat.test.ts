import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { TaskService } from "./taskService";
import { undoManager } from "../lib/undoManager";

describe("TaskService 重复任务（完成自动生成下一实例，合并为一次撤销）", () => {
  let db: Db;
  let close: () => void;
  let tasks: TaskRepository;
  let svc: TaskService;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    tasks = new TaskRepository(db);
    svc = new TaskService(tasks, new FocusSessionRepository(db));
    undoManager.clear();
  });

  afterEach(() => close());

  async function seed(title: string, scheduledDate: string, repeatRule = "") {
    return tasks.create({ title, scheduledDate, repeatRule });
  }

  it("daily：完成后次日生成同标题 TODO 实例", async () => {
    const t = await seed("晨读", "2026-09-28", "daily");
    await svc.completeTask(t.id);
    expect((await tasks.findById(t.id))?.status).toBe("COMPLETED");

    const next = await tasks.findByDate("2026-09-29");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ title: "晨读", status: "TODO", repeatRule: "daily" });
  });

  it("weekdays：周五完成 → 下周一生成", async () => {
    const t = await seed("例会准备", "2026-10-02", "weekdays"); // 周五
    await svc.completeTask(t.id);
    const next = await tasks.findByDate("2026-10-05"); // 周一
    expect(next.some((x) => x.title === "例会准备")).toBe(true);
    expect(await tasks.findByDate("2026-10-03")).toHaveLength(0);
  });

  it("撤销完成 = 还原状态 + 删除下一实例；重做 = 再完成 + 再生成", async () => {
    const t = await seed("晨读", "2026-09-28", "daily");
    await svc.completeTask(t.id);
    expect(await tasks.findByDate("2026-09-29")).toHaveLength(1);

    await undoManager.undo(); // 一次撤销
    expect((await tasks.findById(t.id))?.status).toBe("TODO");
    expect(await tasks.findByDate("2026-09-29")).toHaveLength(0);

    await undoManager.redo();
    expect((await tasks.findById(t.id))?.status).toBe("COMPLETED");
    const next = await tasks.findByDate("2026-09-29");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("TODO");
  });

  it("toggleComplete 同样生成下一实例", async () => {
    const t = await seed("健身", "2026-09-28", "daily");
    await svc.toggleComplete(t.id);
    expect(await tasks.findByDate("2026-09-29")).toHaveLength(1);
  });

  it("非重复任务完成不生成任何新实例", async () => {
    const t = await seed("一次性任务", "2026-09-28");
    await svc.completeTask(t.id);
    expect(await tasks.findByDate("2026-09-29")).toHaveLength(0);
  });

  it("已完成任务的重复实例不会被重复生成（重复完成幂等）", async () => {
    const t = await seed("晨读", "2026-09-28", "daily");
    await svc.completeTask(t.id);
    const before = (await tasks.findByDate("2026-09-29")).length;
    await svc.completeTask(t.id); // 再次完成（已完成）→ 不再生成
    expect(await tasks.findByDate("2026-09-29")).toHaveLength(before);
  });
});
