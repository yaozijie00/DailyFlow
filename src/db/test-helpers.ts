import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { runMigrations, type RunMigrationsOptions } from "./migrate";
import type { Db } from "./db";

/**
 * 创建测试数据库（better-sqlite3），默认内存库。
 * 通过相同的 sqlite-proxy 抽象运行迁移，与生产环境（Tauri 插件）行为一致。
 *
 * 注意：drizzle sqlite-proxy 回调期望返回「值数组」（按列顺序），
 * 因此这里用 better-sqlite3 的 `.raw()` 取数组而非对象。
 *
 * @param filePath 可选：指定 SQLite 文件路径（如临时文件）以验证「关闭重开」持久化；
 *                 缺省 ":memory:"。
 */
export async function createTestDb(
  filePath?: string,
  migrationOptions?: RunMigrationsOptions,
): Promise<{ db: Db; close: () => void }> {
  const sqlite = new Database(filePath ?? ":memory:");
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

  await runMigrations(db, migrationOptions);

  return {
    db,
    close: () => sqlite.close(),
  };
}
