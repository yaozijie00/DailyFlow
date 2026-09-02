import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { TaskService } from "./taskService";
import { undoManager } from "../lib/undoManager";

describe("TaskService Undo 集成（数据与 SQLite 一致）", () => {
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

  async function seedTask(plannedStart = 9 * 3_600_000, plannedEnd = 10 * 3_600_000) {
    return tasks.create({
      title: "任务 A",
      scheduledDate: "2026-08-27",
      plannedStart,
      plannedEnd,
    });
  }

  it("Timeline 移动：updateTask 后 Ctrl+Z 恢复原位置（SQLite 一致）", async () => {
    const t = await seedTask(); // 09:00-10:00
    await svc.updateTask(t.id, { plannedStart: 11 * 3_600_000, plannedEnd: 12 * 3_600_000 });
    expect((await tasks.findById(t.id))?.plannedStart).toBe(11 * 3_600_000);

    expect(undoManager.canUndo()).toBe(true);
    await undoManager.undo();

    const restored = await tasks.findById(t.id);
    expect(restored?.plannedStart).toBe(9 * 3_600_000);
    expect(restored?.plannedEnd).toBe(10 * 3_600_000);
    // 无关字段未被还原（派生字段不参与撤销）
    expect(restored?.title).toBe("任务 A");
  });

  it("连续多个操作：按 C→B→A 顺序撤销", async () => {
    const t = await seedTask();
    // A: 移动 09→11
    await svc.updateTask(t.id, { plannedStart: 11 * 3_600_000, plannedEnd: 12 * 3_600_000 });
    // B: 编辑标题
    await svc.updateTask(t.id, { title: "改名" });
    // C: 完成
    await svc.completeTask(t.id);

    await undoManager.undo(); // 撤销 C：回到未完成
    expect((await tasks.findById(t.id))?.status).toBe("TODO");
    await undoManager.undo(); // 撤销 B：标题还原
    expect((await tasks.findById(t.id))?.title).toBe("任务 A");
    await undoManager.undo(); // 撤销 A：时间还原
    const t2 = await tasks.findById(t.id);
    expect(t2?.plannedStart).toBe(9 * 3_600_000);
    expect(t2?.plannedEnd).toBe(10 * 3_600_000);
    expect(undoManager.canUndo()).toBe(false);
  });

  it("undo 后 redo 恢复新位置", async () => {
    const t = await seedTask();
    await svc.updateTask(t.id, { plannedStart: 14 * 3_600_000, plannedEnd: 15 * 3_600_000 });
    await undoManager.undo();
    expect((await tasks.findById(t.id))?.plannedStart).toBe(9 * 3_600_000);
    await undoManager.redo();
    expect((await tasks.findById(t.id))?.plannedStart).toBe(14 * 3_600_000);
  });

  it("完成 → 撤销 → 重做：状态与完成时间往返一致", async () => {
    const t = await seedTask();
    await svc.completeTask(t.id);
    const completed = await tasks.findById(t.id);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).not.toBeNull();

    await undoManager.undo();
    const undone = await tasks.findById(t.id);
    expect(undone?.status).toBe("TODO");
    expect(undone?.completedAt).toBeNull();

    await undoManager.redo();
    const redone = await tasks.findById(t.id);
    expect(redone?.status).toBe("COMPLETED");
    expect(redone?.completedAt).not.toBeNull();
  });

  it("创建任务 → 撤销删除 → 重做重建（字段一致）", async () => {
    const created = await svc.createTask({
      title: "新任务",
      scheduledDate: "2026-08-27",
      categoryId: null,
      notes: "备注",
    });
    expect(undoManager.canUndo()).toBe(true);

    await undoManager.undo();
    expect(await tasks.findById(created.id)).toBeNull();

    await undoManager.redo();
    const re = await tasks.findByDate("2026-08-27");
    expect(re).toHaveLength(1);
    expect(re[0].title).toBe("新任务");
    expect(re[0].notes).toBe("备注");
  });

  it("撤销恢复不会把「恢复操作」再次入栈（栈长度稳定）", async () => {
    const t = await seedTask();
    await svc.updateTask(t.id, { plannedStart: 12 * 3_600_000, plannedEnd: 13 * 3_600_000 });
    const sizeBefore = undoManager.undoSize;
    await undoManager.undo();
    expect(undoManager.undoSize).toBe(sizeBefore - 1);
    await undoManager.redo();
    expect(undoManager.undoSize).toBe(sizeBefore);
  });

  it("只改标题/备注 → 不重排 sort_order（Timeline 块不跳动）", async () => {    const a = await tasks.create({
      title: "A",
      scheduledDate: "2026-08-27",
      plannedStart: 9 * 3_600_000,
      plannedEnd: 10 * 3_600_000,
    });
    const b = await tasks.create({
      title: "B",
      scheduledDate: "2026-08-27",
      plannedStart: 14 * 3_600_000,
      plannedEnd: 15 * 3_600_000,
    });
    await svc.reorderTasks([b.id, a.id]); // 手动排成 B 在前
    const beforeA = (await tasks.findById(a.id))!.sortOrder;
    const beforeB = (await tasks.findById(b.id))!.sortOrder;
    expect(beforeB).toBeLessThan(beforeA);

    await svc.updateTask(a.id, { title: "改名", notes: "新备注" }); // 只改内容
    expect((await tasks.findById(a.id))!.sortOrder).toBe(beforeA);
    expect((await tasks.findById(b.id))!.sortOrder).toBe(beforeB);

    await svc.updateTask(a.id, { plannedStart: 8 * 3_600_000, plannedEnd: 9 * 3_600_000 }); // 改时间
    expect((await tasks.findById(a.id))!.sortOrder).toBeLessThan(
      (await tasks.findById(b.id))!.sortOrder,
    );
  });

  it("删除任务 → Undo 恢复任务与专注历史（SQLite 一致），Redo 再删", async () => {
    const t = await tasks.create({ title: "删我", scheduledDate: "2026-08-27" });
    const s = await new FocusSessionRepository(db).create({
      taskId: t.id,
      plannedDuration: 1500,
      startedAt: Date.now(),
      actualDuration: 600,
      endedAt: Date.now(),
      completed: false,
    });

    await svc.deleteTask(t.id);
    expect(await tasks.findById(t.id)).toBeNull();
    expect((await new FocusSessionRepository(db).findById(s.id))).toBeNull();

    await undoManager.undo();
    const restored = await tasks.findById(t.id);
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe("删我");
    expect((await new FocusSessionRepository(db).findById(s.id))?.actualDuration).toBe(600);

    await undoManager.redo();
    expect(await tasks.findById(t.id)).toBeNull();
  });

  it("结转：改 scheduledDate → 撤销还原到原日期 → 重做再结转", async () => {
    const t = await tasks.create({ title: "逾期项", scheduledDate: "2026-08-26" });
    await svc.updateTask(t.id, { scheduledDate: "2026-08-27" });
    expect((await tasks.findById(t.id))?.scheduledDate).toBe("2026-08-27");

    await undoManager.undo();
    expect((await tasks.findById(t.id))?.scheduledDate).toBe("2026-08-26");

    await undoManager.redo();
    expect((await tasks.findById(t.id))?.scheduledDate).toBe("2026-08-27");
  });

  it("创建 → 撤销 → 重做 → 再撤销：不残留重复任务块；重做恢复同 id", async () => {
    const t = await svc.createTask({ title: "新任务块", scheduledDate: "2026-08-27" });
    const origId = t.id;
    expect(await tasks.findByDate("2026-08-27")).toHaveLength(1);

    await undoManager.undo();
    expect(await tasks.findByDate("2026-08-27")).toHaveLength(0);

    await undoManager.redo();
    const afterRedo = await tasks.findByDate("2026-08-27");
    expect(afterRedo).toHaveLength(1);
    expect(afterRedo[0].id).toBe(origId); // 同 id 还原（无漂移）

    await undoManager.undo();
    expect(await tasks.findByDate("2026-08-27")).toHaveLength(0); // 不再残留重复
    expect(undoManager.canUndo()).toBe(false);

    await undoManager.redo();
    const again = await tasks.findByDate("2026-08-27");
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe(origId);
  });
});
