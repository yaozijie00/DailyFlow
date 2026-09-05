import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { extSchema } from "./schema";

/**
 * 课程表独立库的「桥接 + 初始化」，与 Tauri 插件解耦：
 * 生产 loader（tauri plugin）与测试（better-sqlite3）都基于同一 client 契约。
 */

export type ExtDb = SqliteRemoteDatabase<typeof extSchema>;

/** 客户端最小契约（与 @tauri-apps/plugin-sql 兼容）。 */
export interface ExtSqlClient {
  execute: (sql: string, params?: unknown[]) => Promise<unknown>;
  select: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
}

/** 建表语句（幂等，无迁移框架；独立库从零创建）。 */
export const EXT_INIT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    title TEXT NOT NULL,
    category_id INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS weekly_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    course_id INTEGER,
    weekday INTEGER NOT NULL,
    start_minutes INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ext_slots_course ON weekly_slots (course_id)`,
  `CREATE TABLE IF NOT EXISTS task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    task_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ext_task_links_task ON task_links (task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ext_task_links_course ON task_links (course_id)`,
];

/** 在 client 上执行建表（幂等）。 */
export async function initExtensionSchema(client: ExtSqlClient): Promise<void> {
  for (const sql of EXT_INIT_STATEMENTS) {
    await client.execute(sql);
  }
}

/** drizzle sqlite-proxy 桥（schema = 扩展 schema）。 */
export function makeExtDb(getClient: () => Promise<ExtSqlClient>): ExtDb {
  return drizzle<typeof extSchema>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (sqlText, params, method) => {
      const client = await getClient();
      if (method === "run") {
        await client.execute(sqlText, params ?? []);
        return { rows: [] };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await client.select(sqlText, params ?? []);
      const arrays = rows.map((r) => Object.values(r as Record<string, unknown>));
      if (method === "get") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { rows: (arrays[0] ?? null) as any };
      }
      return { rows: arrays as any[] };
    },
    { schema: extSchema },
  );
}
