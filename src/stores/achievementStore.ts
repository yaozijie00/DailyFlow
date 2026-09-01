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

export type AchievementFilter = "all" | "unlocked";

interface AchievementState {
  /** 渐进式可见成就：已解锁全部 + 每链当前下一个（未来成就已隐藏） */
  items: AchievementProgressView[];
  loading: boolean;
  filter: AchievementFilter;
  load: () => Promise<void>;
  setFilter: (f: AchievementFilter) => void;
}

export const useAchievementStore = create<AchievementState>((set) => ({
  items: [],
  loading: false,
  filter: "all",

  load: async () => {
    set({ loading: true });
    try {
      const items = await achievementService.getVisibleAchievements();
      set({ items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setFilter: (f) => set({ filter: f }),
}));
