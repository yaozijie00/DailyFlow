import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { runMigrations } from "./migrate";
import type { Db } from "./db";

/**
 * 创建基于内存 SQLite（better-sqlite3）的测试数据库。
 * 通过相同的 sqlite-proxy 抽象运行迁移，与生产环境（Tauri 插件）行为一致。
 *
 * 注意：drizzle sqlite-proxy 回调期望返回「值数组」（按列顺序），
 * 因此这里用 better-sqlite3 的 `.raw()` 取数组而非对象。
 */
export async function createTestDb(): Promise<{ db: Db; close: () => void }> {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle<typeof schema>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...(params as any[]));
        return { rows: [] };
      }
      if (method === "get") {
        const row = stmt.raw().get(...(params as any[]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { rows: (row ?? null) as any };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = stmt.raw().all(...(params as any[]));
      return { rows };
    },
    { schema },
  ) as Db;

  await runMigrations(db);

  return {
    db,
    close: () => sqlite.close(),
  };
}
