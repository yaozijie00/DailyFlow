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

export const useAchievementStore = create<AchievementState>((set) => ({
  items: [],
  totals: { unlocked: 0, total: 0 },
  loading: false,
  filter: "all",

  load: async () => {
    set({ loading: true });
    try {
      const [items, all] = await Promise.all([
        achievementService.getVisibleAchievements(),
        achievementService.getProgressList(),
      ]);
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
