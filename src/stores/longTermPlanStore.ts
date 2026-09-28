import { create } from "zustand";
import { getDb } from "../db/db";
import {
  LongTermPlanRepository,
  type LongTermPhase,
  type LongTermPlanHistoryEntry,
  type PhaseWithProgress,
} from "../db/repositories/longTermPlanRepository";
import type { Task } from "../db/repositories/taskRepository";
import type { GoalWithProgress } from "../db/repositories/goalRepository";
import { taskService } from "./taskStore";
import { useGoalStore } from "./goalStore";
import { useAppStore } from "./appStore";

const repository = new LongTermPlanRepository(getDb());

interface LongTermPlanState {
  selectedPlanId: number | null;
  phases: PhaseWithProgress[];
  tasks: Task[];
  history: LongTermPlanHistoryEntry[];
  loadingDetail: boolean;
  selectPlan: (id: number | null) => Promise<void>;
  loadDetail: (id?: number) => Promise<void>;
  addPhase: (goalId: number, title: string, estimatedMinutes?: number | null) => Promise<void>;
  updatePhase: (id: number, input: Partial<Pick<LongTermPhase, "title" | "estimatedMinutes" | "manualProgress" | "status">>) => Promise<void>;
  removePhase: (id: number) => Promise<void>;
  movePhase: (id: number, direction: -1 | 1) => Promise<void>;
  scheduleNext: (plan: GoalWithProgress, date: string) => Promise<boolean>;
  moveUnfinishedToDate: (date: string) => Promise<void>;
}

async function refreshGoals(): Promise<void> {
  await useGoalStore.getState().load();
}

export const useLongTermPlanStore = create<LongTermPlanState>((set, get) => ({
  selectedPlanId: null,
  phases: [],
  tasks: [],
  history: [],
  loadingDetail: false,

  selectPlan: async (id) => {
    set({ selectedPlanId: id, phases: [], tasks: [], history: [] });
    if (id != null) await get().loadDetail(id);
  },

  loadDetail: async (id) => {
    const goalId = id ?? get().selectedPlanId;
    if (goalId == null) return;
    set({ loadingDetail: true });
    try {
      const [phases, tasks, history] = await Promise.all([
        repository.listPhases(goalId),
        repository.listTasks(goalId),
        repository.listHistory(goalId),
      ]);
      if (get().selectedPlanId === goalId) set({ phases, tasks, history });
    } catch {
      useAppStore.getState().pushToast("error", "加载长期计划详情失败");
    } finally {
      set({ loadingDetail: false });
    }
  },

  addPhase: async (goalId, title, estimatedMinutes) => {
    const value = title.trim();
    if (!value) return;
    await repository.createPhase(goalId, { title: value, estimatedMinutes: estimatedMinutes ?? null });
    await get().loadDetail(goalId);
  },

  updatePhase: async (id, input) => {
    await repository.updatePhase(id, input);
    await get().loadDetail();
    await refreshGoals();
  },

  removePhase: async (id) => {
    await repository.deletePhase(id);
    await get().loadDetail();
    await refreshGoals();
  },

  movePhase: async (id, direction) => {
    const phases = get().phases;
    const index = phases.findIndex((phase) => phase.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= phases.length) return;
    const ids = phases.map((phase) => phase.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await repository.reorderPhases(ids);
    await get().loadDetail();
  },

  scheduleNext: async (plan, date) => {
    try {
      const planTasks = await repository.listTasks(plan.id);
      const next = planTasks.find((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED");
      if (next) {
        await taskService.updateTask(next.id, { scheduledDate: date });
      } else {
        const title = plan.nextAction?.trim();
        if (!title) {
          useAppStore.getState().pushToast("info", "请先填写下一步行动或添加关联任务");
          return false;
        }
        await taskService.createTask({
          title,
          scheduledDate: date,
          goalId: plan.id,
          phaseId: plan.currentPhaseId,
          priority: plan.priority === "p1" || plan.priority === "high" ? "high" : plan.priority === "p3" || plan.priority === "p4" || plan.priority === "low" ? "low" : "medium",
        });
      }
      if (get().selectedPlanId === plan.id) await get().loadDetail(plan.id);
      await refreshGoals();
      useAppStore.getState().pushToast("success", `已安排到 ${date}`);
      return true;
    } catch {
      useAppStore.getState().pushToast("error", "安排任务失败");
      return false;
    }
  },

  moveUnfinishedToDate: async (date) => {
    const pending = get().tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "CANCELLED");
    try {
      for (const task of pending) await taskService.updateTask(task.id, { scheduledDate: date });
      await get().loadDetail();
      useAppStore.getState().pushToast("success", `已将 ${pending.length} 项未完成任务顺延到 ${date}`);
    } catch {
      useAppStore.getState().pushToast("error", "顺延任务失败");
    }
  },
}));

export { repository as longTermPlanRepository };
