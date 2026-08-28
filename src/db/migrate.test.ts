import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./test-helpers";
import { getAppliedMigrationNames, runMigrations } from "./migrate";

describe("getAppliedMigrationNames", () => {
  it("返回已应用的迁移文件名（按应用顺序）", async () => {
    const { db, close } = await createTestDb();
    const names = await getAppliedMigrationNames(db);
    expect(names.length).toBeGreaterThan(0);
    expect(names[0]).toMatch(/\.sql$/);
    await close();
  });

  it("迁移记录表不存在时返回空数组", async () => {
    const { db, close } = await createTestDb();
    await db.run(sql.raw("DROP TABLE IF EXISTS __drizzle_migrations"));
    const names = await getAppliedMigrationNames(db);
    expect(names).toEqual([]);
    await close();
  });
});

describe("runMigrations 事务化（H1）", () => {
  it("迁移中途失败时整体回滚：已执行语句不残留、迁移名不记录", async () => {
    const { db, close } = await createTestDb();
    const bad = {
      "0001_bad.sql":
        "CREATE TABLE tmp_a (id integer); --> statement-breakpoint SELECT * FROM missing_table;",
    };
    await expect(runMigrations(db, { files: bad })).rejects.toThrow();

    const tables = await db.values(
      sql`SELECT name FROM sqlite_master WHERE name = 'tmp_a'`,
    );
    expect(tables.length).toBe(0); // 已执行语句被回滚
    const applied = await getAppliedMigrationNames(db);
    expect(applied).not.toContain("0001_bad.sql");
    await close();
  });

  it("回滚后修正 SQL 可成功重试", async () => {
    const { db, close } = await createTestDb();
    const bad = {
      "0001_bad.sql":
        "CREATE TABLE tmp_a (id integer); --> statement-breakpoint SELECT * FROM missing_table;",
    };
    await expect(runMigrations(db, { files: bad })).rejects.toThrow();

    const good = { "0001_bad.sql": "CREATE TABLE tmp_b (id integer);" };
    const applied = await runMigrations(db, { files: good });
    expect(applied).toEqual(["0001_bad.sql"]);
    const tables = await db.values(
      sql`SELECT name FROM sqlite_master WHERE name = 'tmp_b'`,
    );
    expect(tables.length).toBe(1);
    await close();
  });

  it("存在待应用迁移时触发 onBeforeApply，无新迁移不触发", async () => {
    const { db, close } = await createTestDb();
    const calls: string[][] = [];
    const files = { "0001_new.sql": "CREATE TABLE tmp_c (id integer);" };
    const cb = (pending: string[]) => {
      calls.push(pending);
      return Promise.resolve();
    };

    await runMigrations(db, { files, onBeforeApply: cb });
    expect(calls).toEqual([["0001_new.sql"]]);

    await runMigrations(db, { files, onBeforeApply: cb }); // 再次运行无新迁移
    expect(calls.length).toBe(1);
    await close();
  });
});
