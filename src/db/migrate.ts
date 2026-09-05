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

/**
 * 换表类迁移的「收敛守卫」（A1-P0Fix-② 加固）：
 * 迁移文件在多语句换表（建新表 → 拷数据 → DROP 旧表 → RENAME）之间崩溃/记录丢失时，
 * 库可能停在多种状态。守卫根据表实际结构判定，返回：
 *  - true  = 该迁移实际已完成（记录丢失）→ 跳过整个文件，仅补记迁移记录（不重跑 SQL，
 *            避免用旧结构重建表、丢失其后迁移添加的列/数据）；
 *  - false = 未完成或处于可修复中间态 → 先做最小修复，再照常执行文件（文件内语句幂等收敛）。
 */
const TABLE_SWAP_GUARDS: Record<
  string,
  (db: SqliteRemoteDatabase<typeof schema>) => Promise<boolean>
> = {
  // 0006_focus_sessions_rework：rework 完成的标志 = focus_sessions 含 category_id 列
  // （0000 老表无此列；0018 之后还可能有 planned_* 列）。
  "0006_focus_sessions_rework.sql": async (db) => {
    const hasNew = await db.values(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='focus_sessions_new'`,
    );
    const hasOld = await db.values(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='focus_sessions'`,
    );
    // focus_sessions 存在 → 检查它是否已是 rework 后结构（含 category_id）
    if (hasOld.length > 0) {
      const oldCols = await db.values(
        sql`PRAGMA table_info(focus_sessions)`,
      );
      const hasCategoryCol = oldCols.some(
        (r) => String(r[1]) === "category_id",
      );
      // 若已是 rework 结构（无论记录是否丢失）：0006 已完成 → 仅补记，不重跑
      // （防止重跑用 0006 旧结构重建表、丢失 0018 的 planned_* 列）
      if (hasCategoryCol) {
        return true;
      }
      // 老结构（无 category_id）：正常升级路径，执行文件即可
      return false;
    }
    // focus_sessions 不存在（0006 中途 DROP 后）：若 new 存在则改回原名再执行文件
    if (hasNew.length > 0) {
      try {
        await db.run(sql.raw("ALTER TABLE focus_sessions_new RENAME TO focus_sessions"));
      } catch (e) {
        let msg = e instanceof Error ? e.message : String(e);
        let cause: unknown = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
        while (cause instanceof Error) {
          msg += ` ${cause.message}`;
          cause = (cause as { cause?: unknown }).cause;
        }
        if (!/already exists|no such table/i.test(msg)) {
          const err = new Error(`迁移 0006 收敛守卫失败（RENAME）: ${msg}`);
          (err as { cause?: unknown }).cause = e;
          throw err;
        }
      }
    }
    return false;
  },
};

/**
 * 0006 文件执行前的「残留清理」（migrate 主体在判定老结构需执行 0006 时调用）：
 * 若 focus_sessions_new 残留（此前执行到 ① 后中断留下空壳/半表）而 focus_sessions 是老结构，
 * 先 DROP 残留 new，保证 0006 重跑时 ① 建全新表、④ RENAME 无冲突、数据不重复。
 */
export async function cleanupFocusSessionsResidualNew(
  db: SqliteRemoteDatabase<typeof schema>,
): Promise<void> {
  const hasNew = await db.values(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name='focus_sessions_new'`,
  );
  if (hasNew.length === 0) return;
  // 仅当 focus_sessions 是老结构（无 category_id，0006 未完成）时清理残留 new；
  // 若已 rework 则守卫已走「补记」分支不会到这里。
  const hasOld = await db.values(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name='focus_sessions'`,
  );
  if (hasOld.length === 0) return; // 无 old 由守卫 RENAME 分支处理
  const oldCols = await db.values(sql`PRAGMA table_info(focus_sessions)`);
  const hasCategoryCol = oldCols.some((r) => String(r[1]) === "category_id");
  if (!hasCategoryCol) {
    await db.run(sql.raw("DROP TABLE IF EXISTS focus_sessions_new"));
  }
}

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

    // 换表迁移收敛守卫：若判定「迁移实际已完成（记录丢失）」，跳过 SQL 仅补记记录
    const guard = TABLE_SWAP_GUARDS[name];
    if (guard) {
      const alreadyDone = await guard(db);
      if (alreadyDone) {
        await db.run(
          sql`INSERT INTO __drizzle_migrations (name, created_at) VALUES (${name}, ${Date.now()})`,
        );
        applied.push(name);
        continue;
      }
    }
    // 0006 老结构升级前：清理残留 focus_sessions_new（防 ①跳过/④冲突/数据重复）
    if (name === "0006_focus_sessions_rework.sql") {
      await cleanupFocusSessionsResidualNew(db);
    }

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
        // 幂等跳过仅限建表/加列的 "already exists|duplicate column"；
        // ALTER RENAME 若报 "already exists"（目标表已存在）属结构不一致，必须显式报错而非静默跳过
        const isRename = /RENAME\s+TO/i.test(statement);
        if (!isRename && /already exists|duplicate column/i.test(msg)) continue;
        const err = new Error(`迁移 ${name} 执行失败：\nSQL: ${statement}\n错误: ${msg}`);
        (err as { cause?: unknown }).cause = e;
        throw err;
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
