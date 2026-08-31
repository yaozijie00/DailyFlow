import { create } from "zustand";
import { getDb } from "../db/db";
import {
  GoalRepository,
  type Goal,
  type GoalWithProgress,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "../db/repositories/goalRepository";
import { GoalService } from "../services/goalService";
import { useAppStore } from "./appStore";

const goalService = new GoalService(new GoalRepository(getDb()));

interface GoalState {
  /** 进行中目标（含关联任务进度） */
  goals: GoalWithProgress[];
  /** 已完成目标（历史） */
  completedGoals: Goal[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: CreateGoalInput) => Promise<void>;
  update: (id: number, input: UpdateGoalInput) => Promise<void>;
  complete: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  completedGoals: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const [goals, completedGoals] = await Promise.all([
        goalService.listActiveWithProgress(),
        goalService.listCompleted(),
      ]);
      set({ goals, completedGoals, loading: false });
    } catch {
      set({ loading: false });
      useAppStore.getState().pushToast("error", "加载长期目标失败");
    }
  },

  create: async (input) => {
    try {
      await goalService.create(input);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "创建长期目标失败");
    }
  },

  update: async (id, input) => {
    try {
      await goalService.update(id, input);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "保存长期目标失败");
    }
  },

  complete: async (id) => {
    try {
      await goalService.complete(id);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "完成长期目标失败");
    }
  },

  remove: async (id) => {
    try {
      await goalService.delete(id);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "删除长期目标失败");
    }
  },
}));
