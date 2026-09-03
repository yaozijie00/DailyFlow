import { create } from "zustand";
import { getDb } from "../db/db";
import { ProjectRepository, type ProjectWithGoal } from "../db/repositories/projectRepository";
import { ProjectService } from "../services/projectService";
import { useAppStore } from "./appStore";
import { undoManager } from "../lib/undoManager";

const projectService = new ProjectService(new ProjectRepository(getDb()));

/** 共享项目服务单例（任务表单/详情/长期页复用）。 */
export { projectService };

interface ProjectState {
  /** 全部项目（含所属目标标题） */
  projects: ProjectWithGoal[];
  loading: boolean;
  load: () => Promise<void>;
  /** 在指定目标下创建项目；成功返回 true */
  create: (goalId: number, title: string) => Promise<boolean>;
  /** 重命名项目（v1.8 提供，供后续内联编辑使用） */
  rename: (id: number, title: string) => Promise<void>;
  /** 删除项目（带撤销 Toast） */
  remove: (id: number) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,

  load: async () => {
    if (useAppStore.getState().dbStatus !== "ready") return;
    set({ loading: true });
    try {
      const projects = await projectService.listWithGoal();
      set({ projects, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  create: async (goalId, title) => {
    const t = title.trim();
    if (!t) return false;
    try {
      await projectService.create({ goalId, title: t });
      await get().load();
      return true;
    } catch {
      useAppStore.getState().pushToast("error", "创建项目失败");
      return false;
    }
  },

  rename: async (id, title) => {
    const t = title.trim();
    if (!t) return;
    try {
      await projectService.rename(id, t);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "重命名项目失败");
    }
  },

  remove: async (id) => {
    try {
      await projectService.delete(id);
      await get().load();
      useAppStore.getState().pushToast("success", "项目已删除", {
        label: "撤销",
        onClick: () => {
          void (async () => {
            try {
              await undoManager.undo();
              await get().load();
            } catch {
              useAppStore.getState().pushToast("error", "撤销失败，数据没有改变，请重试");
            }
          })();
        },
      });
    } catch {
      useAppStore.getState().pushToast("error", "删除项目失败");
    }
  },
}));
