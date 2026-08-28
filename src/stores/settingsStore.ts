import { create } from "zustand";
import { getDb } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import {
  SettingsService,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "../services/settingsService";
import { useAppStore } from "./appStore";

const settingsService = new SettingsService(new SettingsRepository(getDb()));

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
}

/** 应用设置 Store：启动时从 SQLite 加载，修改后立即持久化并更新内存。 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const settings = await settingsService.getSettings();
      set({ settings, loaded: true });
    } catch {
      useAppStore.getState().pushToast("error", "加载设置失败");
    }
  },

  update: async (partial) => {
    try {
      await settingsService.update(partial);
      const settings = await settingsService.getSettings();
      set({ settings });
    } catch {
      useAppStore.getState().pushToast("error", "保存设置失败");
    }
  },
}));
