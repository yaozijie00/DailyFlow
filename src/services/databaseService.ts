import { getDb, initDatabase } from "../db/db";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { backupBeforeMigration } from "./backupService";

export interface InitResult {
  ok: boolean;
  error?: string;
  appliedMigrations?: string[];
}

/** 递归展开错误 cause 链（drizzle 包装 "Failed query" 后真实 SQLite 错误在 cause 深处）。 */
function deepestError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  const seen = new Set<unknown>();
  while (cur instanceof Error && !seen.has(cur)) {
    seen.add(cur);
    const m = cur.message;
    // 跳过 drizzle 的纯包装前缀（真实信息在其 cause），但保留非 "Failed query" 的自身信息
    if (parts.length === 0 || !m.startsWith("Failed query:")) parts.push(m);
    cur = (cur as { cause?: unknown }).cause;
  }
  return parts.filter(Boolean).join(" → ") || String(e);
}

/** 数据库服务：初始化（迁移 + 默认分类种子），UI/Store 只通过它接触数据层。 */
export const databaseService = {
  async init(): Promise<InitResult> {
    try {
      // 存在待应用迁移时先自动备份当前库（设计文档 8：先备份 → 迁移）
      const appliedMigrations = await initDatabase({
        onBeforeApply: async () => {
          await backupBeforeMigration();
        },
      });
      await new CategoryRepository(getDb()).seedDefaults();
      return { ok: true, appliedMigrations };
    } catch (e) {
      // 优先暴露底层 SQLite 错误原因（drizzle 会包多层掩盖真实信息）
      return { ok: false, error: deepestError(e) };
    }
  },
};
