import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers";
import type { Db } from "../db";
import { ExtensionStorageRepository } from "./extensionStorageRepository";

describe("ExtensionStorageRepository", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(() => close());

  it("按扩展 ID 隔离同名键并支持覆盖", async () => {
    const a = new ExtensionStorageRepository(db, "com.example.a");
    const b = new ExtensionStorageRepository(db, "com.example.b");
    await a.set("theme", '"light"');
    await b.set("theme", '"dark"');
    await a.set("theme", '"system"');
    expect(await a.get("theme")).toBe('"system"');
    expect(await b.get("theme")).toBe('"dark"');
  });

  it("删除与键列表只影响当前扩展", async () => {
    const a = new ExtensionStorageRepository(db, "com.example.a");
    const b = new ExtensionStorageRepository(db, "com.example.b");
    await a.set("z-last", "1");
    await a.set("a-first", "2");
    await b.set("a-first", "3");
    expect(await a.keys()).toEqual(["a-first", "z-last"]);
    expect(await a.delete("a-first")).toBe(true);
    expect(await a.delete("a-first")).toBe(false);
    expect(await b.get("a-first")).toBe("3");
  });

  it("版本元数据按扩展隔离且默认是 0", async () => {
    const a = new ExtensionStorageRepository(db, "com.example.a");
    const b = new ExtensionStorageRepository(db, "com.example.b");
    expect(await a.getVersion()).toBe(0);
    await a.setVersion(3);
    expect(await a.getVersion()).toBe(3);
    expect(await b.getVersion()).toBe(0);
  });
});
