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
    const updated = await repo.update(created.id, "工作-改");
    expect(updated?.name).toBe("工作-改");
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
});
