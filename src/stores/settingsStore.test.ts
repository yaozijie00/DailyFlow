import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn(), read: vi.fn(), shortcuts: vi.fn(), toast: vi.fn() }));
vi.mock("../db/db", () => ({ getDb: () => ({}) }));
vi.mock("../db/repositories/settingsRepository", () => ({ SettingsRepository: class {} }));
vi.mock("../services/settingsService", async (original) => ({
  ...await original<typeof import("../services/settingsService")>(),
  SettingsService: class {
    update = mocks.update;
    getSettings = mocks.read;
    saveShortcuts = mocks.shortcuts;
  },
}));
vi.mock("./appStore", () => ({ useAppStore: { getState: () => ({ pushToast: mocks.toast }) } }));
vi.mock("../lib/theme", () => ({ applyTheme: vi.fn(), parseThemeMode: vi.fn(), systemPrefersDark: () => false, watchSystemTheme: () => vi.fn() }));
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS } from "../services/settingsService";
import { DEFAULT_SHORTCUTS } from "../lib/shortcuts";

describe("settings persistence feedback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS, shortcuts: DEFAULT_SHORTCUTS });
  });
  it("reports failed writes and retains the last confirmed settings", async () => {
    mocks.update.mockRejectedValue(new Error("disk full"));
    expect(await useSettingsStore.getState().update({ themeMode: "dark" })).toBe(false);
    expect(useSettingsStore.getState().settings).toBe(DEFAULT_SETTINGS);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith("error", expect.stringContaining("保存设置失败"));
  });
  it("confirms success only after reading persisted settings", async () => {
    const saved = { ...DEFAULT_SETTINGS, themeMode: "dark" as const };
    mocks.read.mockResolvedValue(saved);
    expect(await useSettingsStore.getState().update({ themeMode: "dark" })).toBe(true);
    expect(useSettingsStore.getState().settings).toBe(saved);
  });
  it("does not claim shortcut changes when storage rejects them", async () => {
    mocks.shortcuts.mockRejectedValue(new Error("locked"));
    expect(await useSettingsStore.getState().saveShortcuts({ ...DEFAULT_SHORTCUTS })).toBe(false);
    expect(useSettingsStore.getState().shortcuts).toBe(DEFAULT_SHORTCUTS);
  });
});
