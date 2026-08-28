import Database from "@tauri-apps/plugin-sql";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { runMigrations, type RunMigrationsOptions } from "./migrate";

export type Db = SqliteRemoteDatabase<typeof schema>;

/**
 * D2 方案：Drizzle sqlite-proxy 桥接 @tauri-apps/plugin-sql。
 * 该适配器是「类型安全边界」的收口处，内部与插件的 any 类型交互不可避免。
 *
 * 注意：drizzle sqlite-proxy 期望回调返回「值数组」（按列顺序），
 * 而插件 select 返回对象，故这里用 Object.values 转换为值数组。
 */
let sqlite: Database | null = null;

async function getSqlite(): Promise<Database> {
  if (!sqlite) {
    sqlite = await Database.load("sqlite:dailyflow.db");
  }
  return sqlite;
}

let db: Db | null = null;

/**
 * 基于「客户端提供器」创建 drizzle 桥接。
 * 生产用 getSqlite()（Tauri 插件单例）；备份校验时可用临时客户端。
 */
export function makeDb(getClient: () => Promise<Database>): Db {
  return drizzle<typeof schema>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (sqlText, params, method) => {
      const client = await getClient();
      if (method === "run") {
        await client.execute(sqlText, params);
        return { rows: [] };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = await client.select(sqlText, params);
      const arrays = rows.map((r) => Object.values(r as Record<string, unknown>));
      if (method === "get") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { rows: (arrays[0] ?? null) as any };
      }
      return { rows: arrays as any[] };
    },
    { schema },
  );
}

export function getDb(): Db {
  if (!db) {
    db = makeDb(getSqlite);
  }
  return db;
}

/** 关闭并重置数据库连接（恢复备份前调用；下次 getDb() 会重新打开）。 */
export async function closeDb(): Promise<void> {
  if (sqlite) {
    await sqlite.close();
  }
  sqlite = null;
  db = null;
}

/** 初始化数据库：应用所有未执行的迁移，返回本次应用的迁移文件名。 */
export async function initDatabase(options?: RunMigrationsOptions): Promise<string[]> {
  return runMigrations(getDb(), options);
}
