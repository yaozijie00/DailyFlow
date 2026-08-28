import { create } from "zustand";
import { getDb } from "../db/db";
import { NewsRepository, type NewsItem } from "../db/repositories/newsRepository";
import {
  NewsSourceRepository,
  type NewsSource,
  type CreateNewsSourceInput,
  type UpdateNewsSourceInput,
} from "../db/repositories/newsSourceRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { NewsService } from "../services/newsService";
import { NEWS_CATEGORIES, type NewsCategory } from "../lib/newsSources";
import { useAppStore } from "./appStore";

const newsService = new NewsService(
  new NewsRepository(getDb()),
  new NewsSourceRepository(getDb()),
  new SettingsRepository(getDb()),
);

export type CategoryFilter = NewsCategory | "all";

interface NewsState {
  items: NewsItem[];
  sources: NewsSource[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastRefresh: number | null;
  categoryFilter: CategoryFilter;

  load: () => Promise<void>;
  loadSources: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (id: number, read: boolean) => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;
  setCategoryFilter: (c: CategoryFilter) => void;
  validateSource: (url: string) => Promise<"ok" | "not_feed" | "network_error">;
  createSource: (input: CreateNewsSourceInput) => Promise<void>;
  updateSource: (id: number, input: UpdateNewsSourceInput) => Promise<void>;
  deleteSource: (id: number) => Promise<void>;
  toggleSource: (id: number) => Promise<void>;
  reorderSources: (orderedIds: number[]) => Promise<void>;
}

/** 新闻 Store：缓存读取 / 手动+自动刷新 / 已读 / 收藏 / 源管理。失败仅提示，不影响其他功能。 */
export const useNewsStore = create<NewsState>((set, get) => ({
  items: [],
  sources: [],
  loading: false,
  refreshing: false,
  error: null,
  lastRefresh: null,
  categoryFilter: "all",

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [items, lastRefresh] = await Promise.all([
        newsService.listItems(),
        newsService.getLastRefresh(),
      ]);
      set({ items, lastRefresh });
    } catch {
      set({ error: "读取缓存新闻失败" });
    } finally {
      set({ loading: false });
    }
  },

  loadSources: async () => {
    try {
      const sources = await newsService.listSources();
      set({ sources });
    } catch {
      useAppStore.getState().pushToast("error", "读取新闻源失败");
    }
  },

  refresh: async () => {
    set({ refreshing: true, error: null });
    try {
      const result = await newsService.refresh();
      const items = await newsService.listItems();
      set({ items, lastRefresh: result.lastRefresh, refreshing: false });
      if (result.failed > 0 && result.failed === result.total) {
        set({ error: "无法连接网络或所有新闻源均失败" });
        useAppStore.getState().pushToast("error", "新闻刷新失败：无法连接网络");
      } else if (result.failed > 0) {
        useAppStore
          .getState()
          .pushToast("info", `部分新闻源失败（${result.failed} 个），已更新 ${result.inserted} 条`);
      }
    } catch {
      set({ refreshing: false, error: "新闻刷新失败" });
      useAppStore.getState().pushToast("error", "新闻刷新失败");
    }
  },

  markRead: async (id, read) => {
    try {
      await newsService.markRead(id, read);
      set({ items: get().items.map((i) => (i.id === id ? { ...i, isRead: read } : i)) });
    } catch {
      useAppStore.getState().pushToast("error", "更新已读状态失败");
    }
  },

  toggleFavorite: async (id) => {
    const target = get().items.find((i) => i.id === id);
    if (!target) return;
    const next = !target.isFavorite;
    try {
      await newsService.markFavorite(id, next);
      set({ items: get().items.map((i) => (i.id === id ? { ...i, isFavorite: next } : i)) });
    } catch {
      useAppStore.getState().pushToast("error", "收藏失败");
    }
  },

  setCategoryFilter: (c) => set({ categoryFilter: c }),

  validateSource: async (url) => {
    try {
      return await newsService.validateFeed(url);
    } catch {
      return "network_error";
    }
  },

  createSource: async (input) => {
    try {
      await newsService.createSource(input);
      await get().loadSources();
      useAppStore.getState().pushToast("success", "新闻源已添加");
    } catch {
      useAppStore.getState().pushToast("error", "添加新闻源失败（URL 可能已存在）");
    }
  },

  updateSource: async (id, input) => {
    try {
      await newsService.updateSource(id, input);
      await get().loadSources();
      useAppStore.getState().pushToast("success", "新闻源已更新");
    } catch {
      useAppStore.getState().pushToast("error", "更新新闻源失败");
    }
  },

  deleteSource: async (id) => {
    try {
      await newsService.deleteSource(id);
      await get().loadSources();
      useAppStore.getState().pushToast("success", "新闻源已删除");
    } catch {
      useAppStore.getState().pushToast("error", "删除新闻源失败");
    }
  },

  toggleSource: async (id) => {
    const target = get().sources.find((s) => s.id === id);
    if (!target) return;
    try {
      await newsService.updateSource(id, { enabled: !target.enabled });
      await get().loadSources();
    } catch {
      useAppStore.getState().pushToast("error", "切换新闻源状态失败");
    }
  },

  reorderSources: async (orderedIds) => {
    try {
      await newsService.reorderSources(orderedIds);
      await get().loadSources();
    } catch {
      useAppStore.getState().pushToast("error", "调整新闻源顺序失败");
    }
  },
}));

export { NEWS_CATEGORIES };
