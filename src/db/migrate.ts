import { sql } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

/**
 * 迁移执行器：按文件名顺序应用 src/db/migrations/*.sql。
 * 已应用的迁移记录在 __drizzle_migrations 表，避免重复执行。
 *
 * 事务说明：Tauri 生产环境经 @tauri-apps/plugin-sql（sqlx 连接池）执行，
 * 池内多连接下「BEGIN/COMMIT」可能落在不同连接上，事务不可靠（曾导致
 * 建表成功但迁移未记录、后续迁移中断）。因此改为：
 *   - 每条语句独立执行，不依赖事务；
 *   - 迁移 SQL 必须幂等（CREATE/INDEX 用 IF NOT EXISTS）；
 *   - 「表/索引已存在」「列已存在（duplicate column）」类错误视为已应用并跳过；
 * 这样部分应用的迁移可在下次启动时收敛完成，可安全重试。
 *
 * 通过 sqlite-proxy 的抽象 db 执行，同时兼容「Tauri 插件」与「测试内存库」。
 */
const defaultMigrationFiles = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface RunMigrationsOptions {
  /** 测试注入的迁移文件（key=文件名，value=SQL 内容）；默认扫描 migrations/ 目录 */
  files?: Record<string, string>;
  /** 存在待应用迁移时、应用前调用（用于「迁移前自动备份」钩子） */
  onBeforeApply?: (pendingNames: string[]) => Promise<void>;
}

function splitStatements(content: string): string[] {
  return content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runMigrations(
  db: SqliteRemoteDatabase<typeof schema>,
  options: RunMigrationsOptions = {},
): Promise<string[]> {
  const migrationFiles = options.files ?? defaultMigrationFiles;
  const applied: string[] = [];

  await db.run(sql.raw("PRAGMA foreign_keys = ON"));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `));

  const entries = Object.entries(migrationFiles).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  // 迁移前钩子：仅在存在待应用迁移时触发
  const pendingNames: string[] = [];
  for (const [path] of entries) {
    const name = path.split("/").pop() ?? path;
    const existing = await db.all(
      sql`SELECT name FROM __drizzle_migrations WHERE name = ${name}`,
    );
    if (existing.length === 0) pendingNames.push(name);
  }
  if (pendingNames.length > 0 && options.onBeforeApply) {
    await options.onBeforeApply(pendingNames);
  }

  for (const [path, content] of entries) {
    const name = path.split("/").pop() ?? path;

    const existing = await db.all(
      sql`SELECT name FROM __drizzle_migrations WHERE name = ${name}`,
    );
    if (existing.length > 0) continue;

    // 逐语句执行（不依赖跨连接事务）；「已存在/重复列」类幂等错误跳过，保证重试收敛
    for (const statement of splitStatements(content as string)) {
      try {
        await db.run(sql.raw(statement));
      } catch (e) {
        // drizzle 会把底层错误包成 "Failed query: ..."，真实信息在 cause 链上
        let msg = e instanceof Error ? e.message : String(e);
        let cause: unknown = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
        while (cause instanceof Error) {
          msg += ` ${cause.message}`;
          cause = (cause as { cause?: unknown }).cause;
        }
        if (/already exists|duplicate column/i.test(msg)) continue;
        throw e;
      }
    }
    await db.run(
      sql`INSERT INTO __drizzle_migrations (name, created_at) VALUES (${name}, ${Date.now()})`,
    );

    applied.push(name);
  }

  return applied;
}

/** 已应用的迁移文件名（按应用顺序）——用于恢复时的 Schema 版本比对。 */
export async function getAppliedMigrationNames(
  db: SqliteRemoteDatabase<typeof schema>,
): Promise<string[]> {
  try {
    // 用 values() 取原始数组：测试（better-sqlite3）与生产（插件）行为一致
    const rows = await db.values(
      sql`SELECT name FROM __drizzle_migrations ORDER BY id`,
    );
    return rows.map((r) => String(r[0]));
  } catch {
    // 迁移记录表不存在（未迁移过的库）视为无迁移
    return [];
  }
}
