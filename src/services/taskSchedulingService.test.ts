import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../db/test-helpers";
import { TaskRepository } from "../db/repositories/taskRepository";
import { UndoManager } from "../lib/undoManager";
import { TaskSchedulingService } from "./taskSchedulingService";

describe("长期任务批量安排", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let tasks: TaskRepository;
  let service: TaskSchedulingService;
  let history: UndoManager;
  beforeEach(async () => {
    testDb = await createTestDb();
    tasks = new TaskRepository(testDb.db);
    history = new UndoManager();
    service = new TaskSchedulingService(testDb.db, history);
  });
  afterEach(() => testDb.close());
  it("只移动所选任务，跨日清除时间块，并一次撤销与重做", async () => {
    const a = await tasks.create({ title: "本周 A", scheduledDate: "2026-09-16", plannedStart: 123, plannedEnd: 456 });
    const b = await tasks.create({ title: "本周 B", scheduledDate: "2026-09-17" });
    const future = await tasks.create({ title: "下个月", scheduledDate: "2026-10-10" });
    expect(await service.move([a.id, b.id], "2026-09-21")).toBe(2);
    expect(await tasks.findById(a.id)).toMatchObject({ scheduledDate: "2026-09-21", plannedStart: null, plannedEnd: null });
    expect((await tasks.findById(future.id))?.scheduledDate).toBe("2026-10-10");
    await history.undo();
    expect(await tasks.findById(a.id)).toMatchObject({ scheduledDate: "2026-09-16", plannedStart: 123, plannedEnd: 456 });
    expect((await tasks.findById(b.id))?.scheduledDate).toBe("2026-09-17");
    expect(await history.undo()).toBe(false);
    await history.redo();
    expect((await tasks.findById(b.id))?.scheduledDate).toBe("2026-09-21");
  });
  it("重复加入当天保持原时间块且不增加撤销步骤", async () => {
    const a = await tasks.create({ title: "A", scheduledDate: "2026-09-16", plannedStart: 123, plannedEnd: 456 });
    expect(await service.move([a.id, a.id], "2026-09-16")).toBe(0);
    expect((await tasks.findById(a.id))?.plannedStart).toBe(123);
    expect(await history.undo()).toBe(false);
  });
  it("写入失败时不留下部分改期，也不产生撤销记录", async () => {
    const a = await tasks.create({ title: "A", scheduledDate: "2026-09-16" });
    const b = await tasks.create({ title: "B", scheduledDate: "2026-09-16" });
    await testDb.db.run(sql.raw("CREATE TRIGGER reject_b BEFORE UPDATE ON tasks WHEN NEW.title='B' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END"));
    await expect(service.move([a.id, b.id], "2026-09-21")).rejects.toThrow();
    expect((await tasks.findById(a.id))?.scheduledDate).toBe("2026-09-16");
    expect((await tasks.findById(b.id))?.scheduledDate).toBe("2026-09-16");
    expect(await history.undo()).toBe(false);
  });
  it("拒绝已完成、无效日期和已删除的选择，撤销不覆盖后来修改", async () => {
    const a = await tasks.create({ title: "A", scheduledDate: "2026-09-16" });
    await expect(service.move([a.id], "2026-02-31")).rejects.toThrow();
    await expect(service.move([a.id, 99999], "2026-09-21")).rejects.toThrow();
    await service.move([a.id], "2026-09-21");
    await tasks.update(a.id, { scheduledDate: "2026-09-23" });
    await expect(history.undo()).rejects.toThrow();
    expect((await tasks.findById(a.id))?.scheduledDate).toBe("2026-09-23");
    await tasks.update(a.id, { status: "COMPLETED" });
    await expect(service.move([a.id], "2026-09-24")).rejects.toThrow();
  });
});
