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

describe("runMigrations 幂等收敛（H1 重试安全）", () => {
  it("中途失败：已执行语句保留、迁移名不记录，可安全重试", async () => {
    const { db, close } = await createTestDb();
    const bad = {
      "0001_bad.sql":
        "CREATE TABLE tmp_a (id integer); --> statement-breakpoint SELECT * FROM missing_table;",
    };
    await expect(runMigrations(db, { files: bad })).rejects.toThrow();

    const tables = await db.values(
      sql`SELECT name FROM sqlite_master WHERE name = 'tmp_a'`,
    );
    expect(tables.length).toBe(1); // 逐语句执行，已执行语句保留（不依赖回滚）
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

  it("「表已存在/列已存在」类错误被跳过（幂等）", async () => {
    const { db, close } = await createTestDb();
    const files = {
      "0001_dup.sql":
        "CREATE TABLE tmp_x (id integer); --> statement-breakpoint CREATE TABLE tmp_x (id integer);",
    };
    const applied = await runMigrations(db, { files });
    expect(applied).toEqual(["0001_dup.sql"]); // 第二次建表报 already exists 被跳过
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
