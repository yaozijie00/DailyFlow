import { create } from "zustand";
import { getDb } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { AchievementProgressRepository } from "../db/repositories/achievementProgressRepository";
import {
  AchievementService,
  type AchievementProgressView,
} from "../services/achievementService";
import { loadAchievementDefinitions } from "../achievements/definitions";
import { useExtensionStore } from "./extensionStore";

const achievementService = new AchievementService(
  loadAchievementDefinitions(),
  new AchievementProgressRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
  new TaskRepository(getDb()),
);

/** 过滤：全部 / 已解锁 / 未解锁 / 隐藏（v1.6.2 对齐「全部=全部可见项」语义）。 */
export type AchievementFilter = "all" | "unlocked" | "locked" | "hidden";

interface AchievementState {
  /** 渐进式可见成就：已解锁全部 + 每链当前下一个（未来成就已隐藏） */
  items: AchievementProgressView[];
  /** 全部定义计数（顶部总览：已解锁 X / 共 Y） */
  totals: { unlocked: number; total: number };
  loading: boolean;
  filter: AchievementFilter;
  load: () => Promise<void>;
  setFilter: (f: AchievementFilter) => void;
}

/**
 * 归属扩展的成就（extensionId 非空）仅在对应扩展【启用】时展示；
 * 禁用扩展 → 其成就（含已解锁）从成就页消失，解锁记录保留（重启用恢复）。
 * @param isEnabled 查询扩展启用状态的函数（默认走 Extension Store；测试可注入）。
 */
export function filterByExtensionEnabled<T extends { extensionId?: string }>(
  items: T[],
  isEnabled: (extId: string) => boolean = (id) => useExtensionStore.getState().isEnabled(id),
): T[] {
  return items.filter((i) => !i.extensionId || isEnabled(i.extensionId));
}

export const useAchievementStore = create<AchievementState>((set) => ({
  items: [],
  totals: { unlocked: 0, total: 0 },
  loading: false,
  filter: "all",

  load: async () => {
    set({ loading: true });
    try {
      const [visibleAll, progressAll] = await Promise.all([
        achievementService.getVisibleAchievements(),
        achievementService.getProgressList(),
      ]);
      // 只展示 Core 成就 + 已启用扩展的成就（禁用扩展的成就整组隐藏）
      const items = filterByExtensionEnabled(visibleAll);
      const all = filterByExtensionEnabled(progressAll);
      set({
        items,
        totals: {
          unlocked: all.filter((i) => i.unlocked).length,
          total: all.length,
        },
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setFilter: (f) => set({ filter: f }),
}));
