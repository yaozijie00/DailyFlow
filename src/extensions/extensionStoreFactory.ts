import { create } from "zustand";
import type { SettingsRepository } from "../db/repositories/settingsRepository";
import { loadAll, reactivate, deactivate, getLoadedExtensions } from "./registry";
import type { CoreContext } from "./types";

function storageKey(id: string): string {
  return `ext.${id}.enabled`;
}

export interface ExtensionState {
  /** id → 是否启用（持久化；禁用不删除数据） */
  enabled: Record<string, boolean>;
  /** 加载/激活结果变化后的刷新信号 */
  revision: number;
  loading: boolean;
  /** 加载并激活内置扩展（ctx 由 Core 注入，Extension 只能经 Context 访问 Core） */
  init: (ctx?: CoreContext) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  isEnabled: (id: string) => boolean;
}

/** 工厂：注入 SettingsRepository（生产 = getDb 单例；测试 = createTestDb）。 */
export function createExtensionStore(repo: SettingsRepository) {
  return create<ExtensionState>((set, get) => ({
    enabled: {},
    revision: 0,
    loading: false,

    init: async (ctx) => {
      if (get().loading) return;
      set({ loading: true });
      try {
        await loadAll(ctx); // 仅加载模块（不激活）
        const flags: Record<string, boolean> = {};
        for (const ext of getLoadedExtensions()) {
          flags[ext.id] = true; // 首次运行默认启用
          try {
            const raw = await repo.get(storageKey(ext.id));
            if (raw === "0") flags[ext.id] = false;
          } catch {
            /* 读取失败用默认值 */
          }
        }
        // 只激活启用中的扩展：禁用的扩展不 init/activate（服务停），数据保留
        for (const ext of getLoadedExtensions()) {
          if (flags[ext.id]) {
            // eslint-disable-next-line no-await-in-loop
            await reactivate(ext.id);
          }
        }
        set({ enabled: flags, revision: get().revision + 1 });
      } finally {
        set({ loading: false });
      }
    },

    setEnabled: async (id, enabled) => {
      set((s) => ({ enabled: { ...s.enabled, [id]: enabled } }));
      if (enabled) {
        await reactivate(id); // 启用时若上次激活失败则重试
      } else {
        await deactivate(id); // 停用：反注册副作用 + 移除贡献（数据保留）
      }
      try {
        await repo.set(storageKey(id), enabled ? "1" : "0");
      } catch {
        /* 持久化失败不阻塞本次会话 */
      }
      set((s) => ({ revision: s.revision + 1 }));
    },

    isEnabled: (id) => get().enabled[id] ?? false,
  }));
}
