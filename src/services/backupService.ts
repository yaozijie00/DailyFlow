import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { sql } from "drizzle-orm";
import { getDb, makeDb, closeDb, initDatabase, type Db } from "../db/db";
import { getAppliedMigrationNames } from "../db/migrate";
import { todayString } from "../lib/date";
import { getDbBackupParticipant } from "../extensions/registry";

const REQUIRED_TABLES = ["tasks", "categories", "focus_sessions", "settings"];

/**
 * 数据备份 / 恢复（本地文件；A1-P0Fix-③ 起覆盖扩展独立库）。
 *
 * 备份 = 对主库执行 `VACUUM INTO`（完整单文件快照）；若课程扩展（独立库扩展）已启用，
 * 另生成伴生快照 `<name>.course`。两份快照都成功后才由 Rust 发布为可见备份。
 * 恢复流程（严格顺序）：校验 → 自动备份当前 → 关闭主库与扩展库连接 → 覆盖文件 → 重载应用。
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

/**
 * 快照主库 + 扩展独立库伴生（课程库存在时）。伴生失败不阻断主备份（记录型 best-effort）。
 * @returns 生成的文件绝对路径（主库快照）。
 */
async function snapshotMainWithCourse(absPath: string): Promise<void> {
  await snapshotTo(absPath);
  const participant = getDbBackupParticipant();
  if (participant) {
    await participant.snapshotTo(`${absPath}.course`);
  }
}

let backupSequence = 0;

function backupStamp(now = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  backupSequence = (backupSequence + 1) % 1000;
  return `${todayString()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}_${pad(backupSequence, 3)}`;
}

async function createPublishedSnapshot(prefix: string): Promise<string> {
  const dir = await getBackupsDir();
  const filename = `${prefix}_${backupStamp()}.db`;
  const pendingName = `${filename}.pending`;
  const pendingPath = `${dir}\\${pendingName}`;
  try {
    await snapshotMainWithCourse(pendingPath);
    await invoke("publish_backup", { pendingName, backupName: filename });
    return `${dir}\\${filename}`;
  } catch (error) {
    try {
      await invoke("delete_staged_backup", { pendingName });
    } catch {
      // 暂存清理失败不会覆盖原始错误；下次启动/发布会清理同名暂存文件。
    }
    throw error;
  }
}

/** 导出备份：生成带毫秒与序号的独立文件（+课程伴生），返回主库保存的绝对路径。 */
export async function exportBackup(): Promise<string> {
  return createPublishedSnapshot("DailyFlow_Backup");
}

/** 恢复前自动备份当前数据（绝不无备份覆盖）。 */
export async function backupBeforeRestore(): Promise<string> {
  return createPublishedSnapshot("DailyFlow_BeforeRestore");
}

/** 迁移前自动备份（最佳努力：失败不阻断迁移，迁移本身逐语句幂等可收敛）。 */
export async function backupBeforeMigration(): Promise<string | null> {
  try {
    return await createPublishedSnapshot("DailyFlow_PreMigration");
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

  // 3. 关闭主库与扩展独立库连接，避免文件占用（Windows；扩展库连接未关会使伴生替换失败）
  await closeDb();
  const participant = getDbBackupParticipant();
  if (participant) {
    try {
      await participant.close();
    } catch {
      // 扩展库关闭失败不阻断主流程（Rust 侧伴生替换失败会单独报错）
    }
  }

  // 4. 覆盖数据库文件（Rust 侧 std::fs：主库与伴生都先复制 tmp、成功后统一 rename，原子替换；
  //    任一失败报错且两个库都保持原状——不会出现「主库已替换、伴生失败」的半恢复状态）
  try {
    await invoke("restore_backup", { backupName });
  } catch (e) {
    // Rust 侧失败 = 文件未被替换（原子性保证）。此时主库/扩展库连接已关闭，
    // 重新初始化让应用回到可用状态（数据仍是恢复前内容，用户可重试或选其它备份）。
    try {
      await initDatabase();
    } catch {
      // 重连失败：交给调用方提示（页面可刷新重试）
    }
    throw e;
  }

  // 5. 重载应用（重新初始化数据库并刷新全部界面）
  window.location.reload();
}
