import { getDb, initDatabase } from "../db/db";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { backupBeforeMigration } from "./backupService";

export interface InitResult {
  ok: boolean;
  error?: string;
  appliedMigrations?: string[];
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
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
