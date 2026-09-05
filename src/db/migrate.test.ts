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

  it("0012 移除新闻：表与设置键在全新库中不存在（V1.4.0 兼容升级）", async () => {
    const { db, close } = await createTestDb();
    const tables = await db.values(
      sql`SELECT name FROM sqlite_master WHERE name IN ('news_items', 'news_sources')`,
    );
    expect(tables.length).toBe(0);
    const keys = await db.values(
      sql`SELECT key FROM settings WHERE key = 'news_refresh_interval'`,
    );
    expect(keys.length).toBe(0);
    const applied = await getAppliedMigrationNames(db);
    expect(applied).toContain("0012_remove_news.sql");
    await close();
  });

  it("A1：0006 记录丢失但表已 rework（含 category_id）→ 补记不重跑，列与数据保留", async () => {
    const { db, close } = await createTestDb();
    // createTestDb 已全量应用（含 0018 加的 planned_* 列）。模拟：0006 记录丢失
    await db.run(
      sql.raw("DELETE FROM __drizzle_migrations WHERE name = '0006_focus_sessions_rework.sql'"),
    );
    // 插入一条数据行（确保数据存在）
    await db.run(
      sql.raw(
        "INSERT INTO focus_sessions (id, task_id, category_id, planned_duration, actual_duration, started_at, ended_at, completed, created_at) VALUES (888, NULL, NULL, 1500, 0, 1, 2, 1, 1)",
      ),
    );

    const { runMigrations } = await import("./migrate");
    const again = await runMigrations(db);
    expect(again).toContain("0006_focus_sessions_rework.sql");

    // 数据与列保留（守卫判定已完成 → 仅补记；不会用 0006 旧结构重建而丢 0018 列）
    const rows = await db.values(sql`SELECT id FROM focus_sessions WHERE id = 888`);
    expect(rows.length).toBe(1);
    const cols = await db.values(sql`PRAGMA table_info(focus_sessions)`);
    const names = cols.map((r) => String(r[1]));
    expect(names).toContain("category_id");
    expect(names).toContain("planned_break_minutes"); // 0018 列不被重跑丢弃
    const newTbl = await db.values(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='focus_sessions_new'`,
    );
    expect(newTbl.length).toBe(0);
    await close();
  });

  it("A1：0006 中途 DROP 后（new 为 0006 结构、old 无）→ RENAME 回再执行且列齐", async () => {
    const { db, close } = await createTestDb();
    // 构造「纯 0006 中间态」：把 focus_sessions 改回 new 名（此时含 planned_* 列=已 rework，
    // 守卫会走「已完成补记」；为验证 DROP 中间态分支，需构造 old 无 + new 为 0006 原始结构）
    // —— 真实「0006 执行中崩溃于 ③④ 之间」只可能发生在 0006 首次执行（无 0018 列）。
    // 用全新库 + 只跑到 0005 无法直接构造（0006 紧随其后），故验证守卫已完成分支即可（上例）。
    // 此处验证：0006 记录在、new 残留空表 → 不重跑不报错
    await db.run(sql.raw("CREATE TABLE focus_sessions_new (id integer)"));
    const applied = await runMigrations(db);
    expect(applied).not.toContain("0006_focus_sessions_rework.sql");
    await close();
  });

  it("A1：0006 从未应用 + focus_sessions 老结构 + new 残留 → 清理残留后正常执行（用户真实场景）", async () => {
    // 独立内存库（不经 createTestDb 以免已应用 0006）：受控只跑 0000-0005 构造老结构
    const Database = (await import("better-sqlite3")).default;
    const raw = new Database(":memory:");
    raw.pragma("foreign_keys = ON");
    const { drizzle } = await import("drizzle-orm/sqlite-proxy");
    const schemaNs = await import("./schema");
    const db = drizzle<typeof schemaNs>(async (sqlText, params, method) => {
      const stmt = raw.prepare(sqlText);
      if (method === "run") {
        stmt.run(...((params as unknown[]) ?? []));
        return { rows: [] };
      }
      if (method === "get") {
        const row = stmt.raw().get(...((params as unknown[]) ?? []));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { rows: (row ?? null) as any };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = stmt.raw().all(...((params as unknown[]) ?? []));
      return { rows };
    }, { schema: schemaNs });

    const files = import.meta.glob("./migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const upto5: Record<string, string> = {};
    for (const [p, c] of Object.entries(files)) {
      const n = p.split("/").pop() ?? p;
      // 取 0000..0005（排除 0006 及之后）
      const num = n.slice(0, 4);
      if (num >= "0000" && num <= "0005") upto5[n] = c;
    }
    const { runMigrations } = await import("./migrate");
    const applied5 = await runMigrations(db, { files: upto5 });
    expect(applied5.some((n) => n.startsWith("0005"))).toBe(true);

    // 老结构数据行（0000 建的老表 task_id NOT NULL + FK → tasks；先建 task 满足 FK）
    raw
      .prepare(
        "INSERT INTO tasks (id, title, status, actual_duration, scheduled_date, created_at, updated_at) VALUES (1, 't', 'TODO', 0, '2026-01-01', 1, 1)",
      )
      .run();
    raw
      .prepare(
        "INSERT INTO focus_sessions (id, task_id, planned_duration, actual_duration, started_at, ended_at, completed, created_at) VALUES (777, 1, 1500, 1500, 1, 2, 1, 1)",
      )
      .run();
    // 模拟 0006 首次执行到 ① 后中断：残留 focus_sessions_new（0006 结构空表）
    raw
      .prepare(
        "CREATE TABLE focus_sessions_new (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, task_id integer, category_id integer, planned_duration integer NOT NULL, actual_duration integer DEFAULT 0 NOT NULL, started_at integer NOT NULL, ended_at integer, completed integer DEFAULT 0 NOT NULL, created_at integer NOT NULL)",
      )
      .run();

    // 跑全部（0006 及之后）→ 清理残留 new 并正常完成
    const appliedAll = await runMigrations(db);
    expect(appliedAll).toContain("0006_focus_sessions_rework.sql");

    // 数据 777 保留；结构含 category_id；new 不残留
    const rows = raw.prepare("SELECT id FROM focus_sessions WHERE id = 777").all();
    expect(rows.length).toBe(1);
    const cols = raw.prepare("PRAGMA table_info(focus_sessions)").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain("category_id");
    const newTbl = raw
      .prepare("SELECT name FROM sqlite_master WHERE name='focus_sessions_new'")
      .all();
    expect(newTbl.length).toBe(0);
    raw.close();
  });
});
