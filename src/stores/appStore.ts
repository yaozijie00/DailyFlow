import { create } from "zustand";

export type Page =
  | "today"
  | "focus"
  | "goals"
  | "statistics"
  | "settings";
export type DbStatus = "idle" | "ready" | "error";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  text: string;
}

export interface AchievementToast {
  id: number;
  name: string;
  description: string;
}

/** 关闭行为对话框类型：first=首次询问，exit-focus=退出前确认（Focus 运行中）。 */
export type CloseDialogKind = "first" | "exit-focus";

interface AppState {
  currentPage: Page;
  setPage: (page: Page) => void;
  dbStatus: DbStatus;
  dbError: string | null;
  setDbStatus: (status: DbStatus, error?: string | null) => void;

  /** 全局轻提示（3.5 秒自动消失） */
  toasts: Toast[];
  pushToast: (type: ToastType, text: string) => void;
  removeToast: (id: number) => void;

  /** 成就解锁提示（5 秒自动消失） */
  achievementToasts: AchievementToast[];
  pushAchievement: (name: string, description: string) => void;
  removeAchievementToast: (id: number) => void;

  /** 关闭行为对话框（首次询问 / Focus 运行中退出确认）；null=关闭 */
  closeDialog: CloseDialogKind | null;
  openCloseDialog: (kind: CloseDialogKind) => void;
  closeCloseDialog: () => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: "today",
  setPage: (page) => set({ currentPage: page }),
  dbStatus: "idle",
  dbError: null,
  setDbStatus: (status, error = null) => set({ dbStatus: status, dbError: error }),

  toasts: [],
  pushToast: (type, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, type, text }] });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  achievementToasts: [],
  pushAchievement: (name, description) => {
    const id = ++toastId;
    set({ achievementToasts: [...get().achievementToasts, { id, name, description }] });
    setTimeout(() => {
      set((s) => ({ achievementToasts: s.achievementToasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeAchievementToast: (id) =>
    set((s) => ({ achievementToasts: s.achievementToasts.filter((t) => t.id !== id) })),

  closeDialog: null,
  openCloseDialog: (kind) => set({ closeDialog: kind }),
  closeCloseDialog: () => set({ closeDialog: null }),
}));
