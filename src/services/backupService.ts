import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { sql } from "drizzle-orm";
import { getDb, makeDb, closeDb, type Db } from "../db/db";
import { getAppliedMigrationNames } from "../db/migrate";
import { todayString } from "../lib/date";

const REQUIRED_TABLES = ["tasks", "categories", "focus_sessions", "settings"];

/**
 * 数据备份 / 恢复（本地文件）。
 *
 * 备份 = 对当前数据库执行 `VACUUM INTO`（无论 WAL 与否都生成完整、紧凑的单文件快照）。
 * 恢复流程（严格顺序）：校验 → 自动备份当前数据 → 关闭连接 → 覆盖文件 → 重载应用。
 * 恢复前校验 Schema 版本（已应用迁移列表必须与当前一致）。
 */

/** 生成 VACUUM INTO SQL（路径单引号转义）。 */
export function buildVacuumIntoSql(absPath: string): string {
  return `VACUUM INTO '${absPath.replace(/'/g, "''")}'`;
}

/** 应用备份目录（绝对路径；不存在则创建）。 */
export function getBackupsDir(): Promise<string> {
  return invoke<string>("backups_dir");
}

/** 列出备份目录下可恢复的备份文件名（DailyFlow_Backup_*.db，升序）。 */
export function listBackups(): Promise<string[]> {
  return invoke<string[]>("list_backups");
}

async function snapshotTo(absPath: string): Promise<void> {
  await getDb().run(sql.raw(buildVacuumIntoSql(absPath)));
}

/** 导出备份：生成 DailyFlow_Backup_YYYY-MM-DD.db，返回保存的绝对路径。 */
export async function exportBackup(): Promise<string> {
  const dir = await getBackupsDir();
  const filename = `DailyFlow_Backup_${todayString()}.db`;
  const absPath = `${dir}\\${filename}`;
  // 同名已存在则先删除（VACUUM INTO 目标必须不存在）
  await invoke("delete_backup", { backupName: filename });
  await snapshotTo(absPath);
  return absPath;
}

/** 恢复前自动备份当前数据（绝不无备份覆盖）。 */
export async function backupBeforeRestore(): Promise<string> {
  const dir = await getBackupsDir();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${todayString()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `DailyFlow_BeforeRestore_${stamp}.db`;
  const absPath = `${dir}\\${filename}`;
  await snapshotTo(absPath);
  return absPath;
}

/** 迁移前自动备份（最佳努力：失败不阻断迁移，迁移本身已事务化）。 */
export async function backupBeforeMigration(): Promise<string | null> {
  try {
    const dir = await getBackupsDir();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${todayString()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `DailyFlow_PreMigration_${stamp}.db`;
    const absPath = `${dir}\\${filename}`;
    await snapshotTo(absPath);
    return absPath;
  } catch {
    return null;
  }
}

/**
 * 校验备份（用独立连接读备份文件）：
 * 1. SQLite 完整性（PRAGMA integrity_check）；
 * 2. 必需表齐全；
 * 3. Schema 版本（已应用迁移列表）与当前一致。
 */
export async function validateBackupSchema(
  backupDb: Db,
  expectedMigrations: string[],
): Promise<{ ok: boolean; error?: string }> {
  let integrity: Array<Array<unknown>>;
  try {
    // values() 在测试（better-sqlite3）与生产（插件）环境都返回原始数组
    integrity = await backupDb.values(sql.raw("PRAGMA integrity_check"));
  } catch {
    return { ok: false, error: "无法读取备份文件（不是有效的 SQLite 数据库）" };
  }
  if (integrity[0]?.[0] !== "ok") {
    return { ok: false, error: "备份文件完整性校验失败（文件可能已损坏）" };
  }

  const tables = await backupDb.values(
    sql.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tasks','categories','focus_sessions','settings')",
    ),
  );
  if (tables.length !== REQUIRED_TABLES.length) {
    return { ok: false, error: "备份文件缺少必需的数据表（不是有效的 DailyFlow 备份）" };
  }

  const backupMigrations = await getAppliedMigrationNames(backupDb);
  const sameVersion =
    backupMigrations.length === expectedMigrations.length &&
    backupMigrations.every((name, i) => name === expectedMigrations[i]);
  if (!sameVersion) {
    return {
      ok: false,
      error: `备份文件版本与当前应用不匹配（备份 ${backupMigrations.length} 个迁移，当前 ${expectedMigrations.length} 个迁移）`,
    };
  }

  return { ok: true };
}

/**
 * 恢复备份：校验 → 自动备份当前 → 关闭连接 → 覆盖 → 重载应用。
 * 校验失败或自动备份失败都会中止，绝不直接覆盖。
 */
export async function restoreBackup(backupName: string): Promise<void> {
  // 1. 校验备份（临时连接；只关闭该连接，不影响主库连接池）
  // 备份文件在 backups_dir（绝对路径）；插件 path_mapper 对绝对路径整体替换，
  // 直接传绝对路径可避免「sqlite:backups/...」被错误解析到 app_config_dir（Roaming）。
  const dir = await getBackupsDir();
  const backupClient = await Database.load(`sqlite:${dir}\\${backupName}`);
  let result: { ok: boolean; error?: string };
  try {
    const backupDb = makeDb(async () => backupClient);
    const expected = await getAppliedMigrationNames(getDb());
    result = await validateBackupSchema(backupDb, expected);
  } finally {
    await backupClient.close(backupClient.path);
  }
  if (!result.ok) {
    throw new Error(result.error ?? "备份校验失败");
  }

  // 2. 恢复前自动备份当前数据
  await backupBeforeRestore();

  // 3. 关闭主库连接，避免文件占用（Windows）
  await closeDb();

  // 4. 覆盖数据库文件（Rust 侧 std::fs，含清理 -wal/-shm）
  await invoke("restore_backup", { backupName });

  // 5. 重载应用（重新初始化数据库并刷新全部界面）
  window.location.reload();
}
