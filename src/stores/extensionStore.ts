import { getDb } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { createExtensionStore } from "../extensions/extensionStoreFactory";

/**
 * 全局 Extension Store 单例（生产注入 SQLite settings 仓库）。
 * 逻辑与测试入口在 extensions/extensionStoreFactory.ts。
 */
export const useExtensionStore = createExtensionStore(new SettingsRepository(getDb()));
