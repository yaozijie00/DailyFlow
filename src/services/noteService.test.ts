import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { NoteRepository } from "../db/repositories/noteRepository";
import { NoteService } from "./noteService";
import { undoManager } from "../lib/undoManager";

describe("NoteService", () => {
  let db: Db;
  let close: () => void;
  let service: NoteService;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    service = new NoteService(new NoteRepository(db));
    undoManager.clear();
  });

  afterEach(() => close());

  it("create → listActive 可见；listCompleted 不含", async () => {
    const n = await service.create({ title: "整理素材" });
    expect(n.status).toBe("active");
    expect((await service.listActive()).map((x) => x.title)).toEqual(["整理素材"]);
    expect(await service.listCompleted()).toHaveLength(0);
  });

  it("complete → 移到已完成列表，数据保留", async () => {
    const n = await service.create({ title: "学习 Substance" });
    const done = await service.complete(n.id);
    expect(done?.status).toBe("completed");
    expect(await service.listActive()).toHaveLength(0);
    expect((await service.listCompleted()).map((x) => x.title)).toEqual(["学习 Substance"]);
  });

  it("update 修改内容", async () => {
    const n = await service.create({ title: "A" });
    const updated = await service.update(n.id, { title: "B" });
    expect(updated?.title).toBe("B");
  });

  it("delete 移除", async () => {
    const n = await service.create({ title: "A" });
    expect(await service.delete(n.id)).toBe(true);
    expect(await service.listActive()).toHaveLength(0);
  });

  describe("Undo/Redo（v1.6）", () => {
    it("create → Undo 删除，Redo 恢复", async () => {
      await service.create({ title: "新便签" });
      expect(undoManager.canUndo()).toBe(true);
      await undoManager.undo();
      expect((await service.listActive()).map((x) => x.title)).not.toContain("新便签");
      await undoManager.redo();
      expect((await service.listActive()).map((x) => x.title)).toContain("新便签");
    });

    it("delete → Undo 以原 id 恢复", async () => {
      const n = await service.create({ title: "删我" });
      await service.delete(n.id);
      expect((await service.listActive())).toHaveLength(0);
      await undoManager.undo();
      expect((await service.listActive()).map((x) => x.id)).toContain(n.id);
    });

    it("complete → Undo 恢复 active", async () => {
      const n = await service.create({ title: "完成它" });
      await service.complete(n.id);
      await undoManager.undo();
      const restored = (await service.listActive())[0];
      expect(restored.title).toBe("完成它");
      expect(restored.status).toBe("active");
    });
  });
});
