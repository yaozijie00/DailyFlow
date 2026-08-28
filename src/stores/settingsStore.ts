import { create } from "zustand";
import { getDb } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import {
  SettingsService,
  DEFAULT_SETTINGS,
  type AppSettings,
} from "../services/settingsService";
import { useAppStore } from "./appStore";
import { DEFAULT_SHORTCUTS, type ShortcutMap } from "../lib/shortcuts";

const settingsService = new SettingsService(new SettingsRepository(getDb()));

interface SettingsState {
  settings: AppSettings;
  shortcuts: ShortcutMap;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
  saveShortcuts: (map: ShortcutMap) => Promise<void>;
}

/** 应用设置 Store：启动时从 SQLite 加载，修改后立即持久化并更新内存。 */
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  shortcuts: DEFAULT_SHORTCUTS,
  loaded: false,

  load: async () => {
    try {
      const [settings, shortcuts] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getShortcuts(),
      ]);
      set({ settings, shortcuts, loaded: true });
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

  saveShortcuts: async (map: ShortcutMap) => {
    try {
      await settingsService.saveShortcuts(map);
      set({ shortcuts: map });
    } catch {
      useAppStore.getState().pushToast("error", "保存快捷键失败");
    }
  },
}));
