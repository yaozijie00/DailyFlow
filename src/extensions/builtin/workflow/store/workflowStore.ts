import { create } from "zustand";
import { workflowService } from "../services/workflowService";
import { useAppStore } from "../../../../stores/appStore";
import type { Workflow, WorkflowRun } from "../models";
import type { WorkflowTemplate } from "../templates/templateService";

export type WorkflowSummary = {
  id: string;
  name: string;
  description?: string;
  version: number;
  tags: string[];
  updatedAt: number;
};

interface WorkflowState {
  list: WorkflowSummary[];
  /** 当前打开（编辑）的 Workflow 全文 */
  current: Workflow | null;
  currentTemplate: WorkflowTemplate | null;
  loading: boolean;
  activeRuns: WorkflowRun[];
  loadingRuns: boolean;
  loadList: () => Promise<void>;
  load: (id: string) => Promise<void>;
  loadTemplate: (id: string) => Promise<void>;
  clearCurrent: () => void;
  create: (input: { name: string; description?: string; tags?: string[] }) => Promise<string | null>;
  updateMeta: (
    id: string,
    input: { name: string; description?: string; tags?: string[] },
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  loadActiveRuns: () => Promise<void>;
}

function fail(text: string): void {
  useAppStore.getState().pushToast("error", text);
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  list: [],
  current: null,
  currentTemplate: null,
  loading: false,
  activeRuns: [],
  loadingRuns: false,

  loadList: async () => {
    set({ loading: true });
    try {
      const list = await workflowService.list();
      set({ list });
    } catch {
      fail("加载 Workflow 列表失败");
    } finally {
      set({ loading: false });
    }
  },

  load: async (id) => {
    try {
      const wf = await workflowService.get(id);
      set({ current: wf });
    } catch {
      fail("加载 Workflow 失败");
    }
  },

  loadTemplate: async (id) => {
    try {
      set({ currentTemplate: await workflowService.getTemplate(id) });
    } catch {
      set({ currentTemplate: null });
      fail("加载 Workflow 模板失败");
    }
  },

  clearCurrent: () => set({ current: null, currentTemplate: null }),

  create: async (input) => {
    try {
      const wf = await workflowService.createTemplate(input);
      await get().loadList();
      useAppStore.getState().pushToast("success", "Workflow 已创建");
      return wf.id;
    } catch {
      fail("创建 Workflow 失败");
      return null;
    }
  },

  updateMeta: async (id, input) => {
    try {
      await workflowService.updateMeta(id, input);
      await get().loadList();
      const cur = get().current;
      if (cur && cur.id === id) {
        await get().load(id);
      }
      useAppStore.getState().pushToast("success", "已保存");
    } catch {
      fail("保存 Workflow 失败");
    }
  },

  remove: async (id) => {
    try {
      await workflowService.remove(id);
      await get().loadList();
      if (get().current?.id === id) set({ current: null });
      useAppStore.getState().pushToast("success", "Workflow 已删除");
    } catch {
      fail("删除 Workflow 失败");
    }
  },

  duplicate: async (id) => {
    try {
      await workflowService.duplicate(id);
      await get().loadList();
      useAppStore.getState().pushToast("success", "已复制为「副本」");
    } catch {
      fail("复制 Workflow 失败");
    }
  },

  loadActiveRuns: async () => {
    set({ loadingRuns: true });
    try {
      set({ activeRuns: await workflowService.listActiveRuns() });
    } catch {
      fail("加载运行记录失败");
    } finally {
      set({ loadingRuns: false });
    }
  },
}));
