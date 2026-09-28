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
import {
  applyTheme,
  parseThemeMode,
  systemPrefersDark,
  watchSystemTheme,
} from "../lib/theme";

const settingsService = new SettingsService(new SettingsRepository(getDb()));

/** 系统深浅跟随监听器（仅「跟随系统」模式需要实时响应）。 */
let stopWatchSystem: (() => void) | null = null;

/** 依据设置 theme_mode + 系统深浅，把主题类写到 <html>。 */
function syncTheme(mode: string | null | undefined): void {
  applyTheme(parseThemeMode(mode ?? null), systemPrefersDark());
}

/** 注册系统深浅变化监听（幂等）。 */
function ensureSystemWatcher(): void {
  if (stopWatchSystem) return;
  stopWatchSystem = watchSystemTheme(() => {
    const m = useSettingsStore.getState().settings.themeMode;
    if (m === "system") syncTheme(m);
  });
}

interface SettingsState {
  settings: AppSettings;
  shortcuts: ShortcutMap;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<boolean>;
  saveShortcuts: (map: ShortcutMap) => Promise<boolean>;
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
      // 主题应用：持久化 theme_mode（默认跟随系统）写到 <html>；注册系统跟随监听
      syncTheme(settings.themeMode);
      ensureSystemWatcher();
    } catch {
      useAppStore.getState().pushToast("error", "加载设置失败");
    }
  },

  update: async (partial) => {
    try {
      await settingsService.update(partial);
      const settings = await settingsService.getSettings();
      set({ settings });
      // 主题改动即时生效（含切回 system 时重新跟随）
      if (partial.themeMode !== undefined) {
        syncTheme(settings.themeMode);
        ensureSystemWatcher();
      }
      return true;
    } catch {
      useAppStore.getState().pushToast("error", "保存设置失败，请重试");
      return false;
    }
  },

  saveShortcuts: async (map: ShortcutMap) => {
    try {
      await settingsService.saveShortcuts(map);
      set({ shortcuts: map });
      return true;
    } catch {
      useAppStore.getState().pushToast("error", "保存快捷键失败，请重试");
      return false;
    }
  },
}));
