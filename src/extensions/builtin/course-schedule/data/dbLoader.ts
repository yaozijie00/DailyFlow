import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { initExtensionSchema, makeExtDb, type ExtDb, type ExtSqlClient } from "./bridge";

/**
 * 生产 loader：课程表独立 SQLite 文件（A1-P0Fix-③ 起经 Rust course_db_path 绝对路径托管，
 * 与主库同数据目录，随备份/恢复/路径设置管理；旧 Roaming 位置由 Rust 一次性迁移）。
 * 统一入口 openExtensionDb()：懒加载 client → 幂等建表 → 桥接 drizzle（单例）。
 */
let sqlite: Database | null = null;
let client: ExtSqlClient | null = null;
let db: ExtDb | null = null;
let ready: Promise<ExtDb> | null = null;

/** 课程库绝对路径（Rust：数据目录\course-schedule.db，含旧位置迁移）。 */
export async function getExtensionDbPath(): Promise<string> {
  return invoke<string>("course_db_path");
}

/** 打开课程库的底层客户端（供备份快照用；未打开则打开）。 */
async function ensureClient(): Promise<ExtSqlClient> {
  if (!client) {
    await openExtensionDb();
  }
  return client!;
}

async function ensureOpen(): Promise<ExtDb> {
  if (!ready) {
    ready = (async () => {
      if (!sqlite) {
        const absPath = await getExtensionDbPath();
        sqlite = await Database.load("sqlite:" + absPath);
      }
      client = sqlite as unknown as ExtSqlClient;
      await initExtensionSchema(client); // 幂等建表
      db = makeExtDb(() => Promise.resolve(client!));
      return db;
    })();
  }
  return ready;
}

/** 打开并初始化独立库（幂等；空库自动建表）。 */
export function openExtensionDb(): Promise<ExtDb> {
  return ensureOpen();
}

/** 兼容旧名（extension init 生命周期使用）。 */
export function initExtensionDatabase(): Promise<ExtDb> {
  return ensureOpen();
}

/** 测试/管理用：直接用外部 client 建库实例（不经过生产单例）。 */
export function openExtensionDbWith(clientArg: ExtSqlClient): ExtDb {
  return makeExtDb(() => Promise.resolve(clientArg));
}

/** 关闭独立库连接（备用；备份恢复前调用）。 */
export async function closeExtensionDatabase(): Promise<void> {
  if (sqlite) {
    await sqlite.close();
  }
  sqlite = null;
  client = null;
  db = null;
  ready = null;
}

/**
 * 把课程库 VACUUM INTO 到目标绝对路径（备份伴生文件用；目标须不存在）。
 * 未打开课程库时跳过（扩展未激活则无需快照其空/旧文件？——为空库无数据，可跳过）。
 */
export async function snapshotExtensionDbTo(absTargetPath: string): Promise<boolean> {
  if (!ready) return false; // 扩展库从未打开（无数据/未激活）→ 无可快照
  const c = await ensureClient();
  const escaped = absTargetPath.replace(/'/g, "''");
  await c.execute(`VACUUM INTO '${escaped}'`);
  return true;
}

/** 课程库是否已打开（备份时判断是否需要伴生文件）。 */
export function isExtensionDbOpen(): boolean {
  return ready != null && sqlite != null;
}
