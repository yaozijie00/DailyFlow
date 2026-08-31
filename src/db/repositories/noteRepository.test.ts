import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { NoteRepository } from "./noteRepository";
import { CategoryRepository } from "./categoryRepository";

describe("NoteRepository", () => {
  let db: Db;
  let close: () => void;
  let notes: NoteRepository;
  let categories: CategoryRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    notes = new NoteRepository(db);
    categories = new CategoryRepository(db);
  });

  afterEach(() => close());

  it("create 默认 active 状态", async () => {
    const n = await notes.create({ title: "设计背包 UI" });
    expect(n.title).toBe("设计背包 UI");
    expect(n.status).toBe("active");
    expect(n.completedAt).toBeNull();
  });

  it("listActive 只返回未完成（active + arranged），不含 completed", async () => {
    await notes.create({ title: "A" });
    await notes.create({ title: "B", status: "arranged" });
    const c = await notes.create({ title: "C" });
    await notes.complete(c.id);

    const active = await notes.listActive();
    expect(active.map((n) => n.title).sort()).toEqual(["A", "B"]);
  });

  it("listCompleted 只返回已完成", async () => {
    await notes.create({ title: "A" });
    const b = await notes.create({ title: "B" });
    await notes.complete(b.id);

    const completed = await notes.listCompleted();
    expect(completed.map((n) => n.title)).toEqual(["B"]);
    expect(await notes.listActive()).toHaveLength(1);
  });

  it("update 修改标题与状态", async () => {
    const n = await notes.create({ title: "A" });
    const updated = await notes.update(n.id, { title: "B", status: "arranged" });
    expect(updated?.title).toBe("B");
    expect(updated?.status).toBe("arranged");
  });

  it("complete 保留数据并标记完成时间", async () => {
    const n = await notes.create({ title: "A" });
    const done = await notes.complete(n.id);
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).not.toBeNull();
    // 数据仍在（不删除）
    expect(await notes.findById(n.id)).not.toBeNull();
    // 重复 complete 幂等
    const again = await notes.complete(n.id);
    expect(again?.status).toBe("completed");
  });

  it("delete 物理删除", async () => {
    const n = await notes.create({ title: "A" });
    expect(await notes.delete(n.id)).toBe(true);
    expect(await notes.findById(n.id)).toBeNull();
    expect(await notes.delete(n.id)).toBe(false);
  });

  it("便签独立于日期：无日期字段，持久存在", async () => {
    const n = await notes.create({ title: "长期想法" });
    const again = await notes.findById(n.id);
    expect(again?.title).toBe("长期想法");
  });

  it("关联分类（FK SET NULL：删除分类后便签保留）", async () => {
    const cat = await categories.create("灵感");
    const n = await notes.create({ title: "A", categoryId: cat.id });
    expect(n.categoryId).toBe(cat.id);
    await categories.delete(cat.id);
    const kept = await notes.findById(n.id);
    expect(kept).not.toBeNull();
    expect(kept?.categoryId).toBeNull();
  });
});
