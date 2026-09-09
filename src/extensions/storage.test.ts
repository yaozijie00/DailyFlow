import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { createExtensionStorage } from "./storage";

describe("ExtensionStorage", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(() => close());

  it("往返 JSON、列出键并隔离扩展", async () => {
    const a = createExtensionStorage(db, "com.example.a");
    const b = createExtensionStorage(db, "com.example.b");
    await a.set("preferences.v1", { compact: true, sizes: [1, 2] });
    await b.set("preferences.v1", { compact: false });
    expect(await a.get("preferences.v1")).toEqual({ compact: true, sizes: [1, 2] });
    expect(await b.get("preferences.v1")).toEqual({ compact: false });
    expect(await a.keys()).toEqual(["preferences.v1"]);
  });

  it("拒绝非法键与非 JSON 运行时值", async () => {
    const storage = createExtensionStorage(db, "com.example.a");
    await expect(storage.set("bad key", true)).rejects.toThrow(/存储键/);
    await expect(storage.set("nan", Number.NaN)).rejects.toThrow(/NaN/);
    await expect(
      storage.set("date", new Date() as unknown as never),
    ).rejects.toThrow(/普通 JSON 对象/);
  });

  it("按连续版本迁移且重复调用不重复执行", async () => {
    const storage = createExtensionStorage(db, "com.example.a");
    const first = vi.fn(async () => storage.set("name", "v1"));
    const second = vi.fn(async () => storage.set("name", "v2"));
    const migrations = [
      { version: 1, migrate: first },
      { version: 2, migrate: second },
    ];
    await storage.migrate(2, migrations);
    await storage.migrate(2, migrations);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(await storage.version()).toBe(2);
    expect(await storage.get("name")).toBe("v2");
  });

  it("迁移失败不提升该版本，并可在下次调用重试", async () => {
    const storage = createExtensionStorage(db, "com.example.a");
    let attempts = 0;
    const migrations = [{
      version: 1,
      migrate: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("暂时失败");
        await storage.set("ready", true);
      },
    }];
    await expect(storage.migrate(1, migrations)).rejects.toThrow("暂时失败");
    expect(await storage.version()).toBe(0);
    await storage.migrate(1, migrations);
    expect(attempts).toBe(2);
    expect(await storage.version()).toBe(1);
  });

  it("拒绝缺失迁移、重复版本和数据降级", async () => {
    const storage = createExtensionStorage(db, "com.example.a");
    await expect(storage.migrate(2, [{ version: 2, migrate: async () => undefined }]))
      .rejects.toThrow(/缺少.*1/);
    await expect(storage.migrate(1, [
      { version: 1, migrate: async () => undefined },
      { version: 1, migrate: async () => undefined },
    ])).rejects.toThrow(/重复/);
    await storage.migrate(1, [{ version: 1, migrate: async () => undefined }]);
    await expect(storage.migrate(0, [])).rejects.toThrow(/拒绝降级/);
  });
});
