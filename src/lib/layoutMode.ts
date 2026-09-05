import { create } from "zustand";
import type { LayoutMode } from "../services/settingsService";

/**
 * 会话级视图模式（A3 Layout Modes）：
 * - currentLayoutMode：本次会话当前模式（右上角切换器只改它，不写设置）；
 * - 启动/设置变更时由宿主同步 defaultLayoutMode 为基底；
 * - 「设为默认」才把当前模式写入 Settings（持久化）。
 *
 * 约定：切换器改 current；Settings 页改 default 并同步 current。
 */
interface LayoutModeState {
  current: LayoutMode;
  setCurrent: (m: LayoutMode) => void;
}

export const useLayoutModeStore = create<LayoutModeState>((set) => ({
  current: "standard",
  setCurrent: (m) => set({ current: m }),
}));
