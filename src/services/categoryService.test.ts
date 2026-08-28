import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { CategoryService } from "./categoryService";

describe("CategoryService", () => {
  let db: Db;
  let close: () => void;
  let svc: CategoryService;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    svc = new CategoryService(new CategoryRepository(db));
  });

  afterEach(() => close());

  test("create → findAll → rename → reorder → delete", async () => {
    const a = await svc.create("A");
    const b = await svc.create("B");
    expect((await svc.findAll()).map((c) => c.name)).toEqual(["A", "B"]);
    await svc.rename(a.id, "A2");
    expect((await svc.findAll()).find((c) => c.id === a.id)?.name).toBe("A2");
    await svc.reorder([b.id, a.id]);
    expect((await svc.findAll()).map((c) => c.id)).toEqual([b.id, a.id]);
    await svc.delete(b.id);
    expect((await svc.findAll()).map((c) => c.id)).toEqual([a.id]);
  });
});
