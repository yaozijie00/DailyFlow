import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import { NoteRepository } from "../db/repositories/noteRepository";
import { PlanningWorkspaceService } from "../services/planningWorkspaceService";
import { NoteService } from "../services/noteService";
import { UndoManager, undoManager } from "./undoManager";
import { convertNoteToPlanning } from "./noteConvertPlanning";

describe("收集箱整理", () => {
  let data: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { data = await createTestDb(); undoManager.clear(); });
  afterEach(() => { vi.restoreAllMocks(); undoManager.clear(); data.close(); });

  it("保存笔记独立持久化、可搜索，撤销放回收集箱", async () => {
    const repo = new NoteRepository(data.db), service = new NoteService(repo);
    const note = await repo.create({ title: "参考记录" });
    await service.update(note.id, { status: "saved" });
    expect((await repo.listActive())[0].status).toBe("saved");
    expect((await repo.searchActiveByTitle("参考"))[0].id).toBe(note.id);
    await undoManager.undo();
    expect((await repo.findById(note.id))?.status).toBe("active");
    await undoManager.redo();
    expect((await repo.findById(note.id))?.status).toBe("saved");
  });

  it.each(["plan", "project", "idea"] as const)("转为 %s 保留原文，重复点击不复制，撤销重做保持 ID", async (target) => {
    const repo = new NoteRepository(data.db), history = new UndoManager();
    const source = await repo.create({ title: "完整原文\n下一行" });
    const [key, duplicate] = await Promise.all([
      convertNoteToPlanning(data.db, source.id, target, history),
      convertNoteToPlanning(data.db, source.id, target, history),
    ]);
    expect(key).toBeTruthy(); expect(duplicate).toBeNull();
    expect(await convertNoteToPlanning(data.db, source.id, target, history)).toBeNull();
    const workspace = new PlanningWorkspaceService(data.db);
    expect(await workspace.list("2026-09-28")).toMatchObject([{ key, title: source.title, lifecycle: target === "idea" ? "idea" : "not_started" }]);
    expect(await repo.listCompleted()).toMatchObject([{ id: source.id, title: source.title }]);
    expect(history.undoSize).toBe(1);
    await history.undo();
    expect(await workspace.list("2026-09-28")).toHaveLength(0);
    expect((await repo.findById(source.id))?.status).toBe("active");
    await history.redo();
    expect(await workspace.list("2026-09-28")).toMatchObject([{ key }]);
    expect((await repo.findById(source.id))?.status).toBe("completed");
  });

  it("源归档失败时移除新目标，不污染撤销栈，重试只生成一项", async () => {
    const repo = new NoteRepository(data.db), history = new UndoManager();
    const source = await repo.create({ title: "失败保留" });
    vi.spyOn(NoteRepository.prototype, "complete").mockRejectedValueOnce(new Error("write failed"));
    await expect(convertNoteToPlanning(data.db, source.id, "project", history)).rejects.toThrow("write failed");
    const workspace = new PlanningWorkspaceService(data.db);
    expect(await workspace.list("2026-09-28")).toHaveLength(0);
    expect((await repo.findById(source.id))?.status).toBe("active");
    expect(history.undoSize).toBe(0);
    await convertNoteToPlanning(data.db, source.id, "project", history);
    expect(await workspace.list("2026-09-28")).toHaveLength(1);
  });

  it("已保存笔记和不存在的收集项不可直接转换", async () => {
    const source = await new NoteRepository(data.db).create({ title: "参考", status: "saved" });
    expect(await convertNoteToPlanning(data.db, source.id, "plan")).toBeNull();
    expect(await convertNoteToPlanning(data.db, 999, "idea")).toBeNull();
  });
});
