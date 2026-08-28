import { create } from "zustand";

export type Page = "today" | "focus" | "news" | "settings";
export type DbStatus = "idle" | "ready" | "error";

export type ToastType = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  type: ToastType;
  text: string;
}

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
}));
