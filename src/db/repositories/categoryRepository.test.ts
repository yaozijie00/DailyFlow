import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { CategoryRepository } from "./categoryRepository";

describe("CategoryRepository", () => {
  let db: Db;
  let close: () => void;
  let repo: CategoryRepository;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    repo = new CategoryRepository(db);
  });

  afterEach(() => close());

  it("creates a category and returns it with an id", async () => {
    const created = await repo.create("开发");
    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe("开发");
    expect(created.createdAt).toBeTypeOf("number");
  });

  it("lists all categories", async () => {
    await repo.create("开发");
    await repo.create("设计");
    const all = await repo.findAll();
    expect(all.map((c) => c.name)).toEqual(["开发", "设计"]);
  });

  it("finds a category by id", async () => {
    const created = await repo.create("学习");
    const found = await repo.findById(created.id);
    expect(found?.name).toBe("学习");
  });

  it("returns null when category not found", async () => {
    expect(await repo.findById(9999)).toBeNull();
  });

  it("updates a category name", async () => {
    const created = await repo.create("工作");
    const updated = await repo.update(created.id, { name: "工作-改" });
    expect(updated?.name).toBe("工作-改");
  });

  it("create 自动分配默认颜色，update 可改颜色", async () => {
    const created = await repo.create("测试色");
    expect(created.color).toBeTruthy();
    const updated = await repo.update(created.id, { color: "#123456" });
    expect(updated?.color).toBe("#123456");
    const found = await repo.findById(created.id);
    expect(found?.color).toBe("#123456");
  });

  it("deletes a category", async () => {
    const created = await repo.create("生活");
    const ok = await repo.delete(created.id);
    expect(ok).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it("seeds the six default categories", async () => {
    const seeded = await repo.seedDefaults();
    expect(seeded.map((c) => c.name)).toEqual([
      "开发",
      "设计",
      "学习",
      "工作",
      "生活",
      "其他",
    ]);
  });

  describe("排序与重排", () => {
    it("findAll 按 sort_order 升序", async () => {
      await repo.create("B");
      await repo.create("A");
      const all = await repo.findAll();
      expect(all.map((c) => c.name)).toEqual(["B", "A"]); // 创建顺序即 sort_order
      await repo.reorder(all.map((c) => c.id).reverse());
      const re = await repo.findAll();
      expect(re.map((c) => c.name)).toEqual(["A", "B"]);
    });

    it("新增分类 sort_order = MAX+1", async () => {
      const c1 = await repo.create("X");
      const c2 = await repo.create("Y");
      expect(c2.sortOrder).toBe(c1.sortOrder + 1);
    });
  });

  describe("删除分类任务置空", () => {
    it("删除分类后任务 category_id 为 NULL", async () => {
      const cat = await repo.create("待删");
      // 直接用 drizzle sql 模板插入任务（沿用 migrate.ts 的写法）
      const { sql } = await import("drizzle-orm");
      await db.run(
        sql`INSERT INTO tasks (title, scheduled_date, created_at, updated_at, category_id) VALUES ('任务', '2026-08-28', 1, 1, ${cat.id})`,
      );
      await repo.delete(cat.id);
      const { tasks } = await import("../schema");
      const row = await db
        .select({ categoryId: tasks.categoryId })
        .from(tasks)
        .get();
      expect(row?.categoryId).toBeNull();
    });
  });
});
