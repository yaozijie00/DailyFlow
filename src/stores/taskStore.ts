import { create } from "zustand";
import { getDb } from "../db/db";
import { TaskRepository, type Task, type UpdateTaskInput } from "../db/repositories/taskRepository";
import { CategoryRepository, type Category } from "../db/repositories/categoryRepository";
import { TaskService, type TaskCreateInput } from "../services/taskService";
import { CategoryService } from "../services/categoryService";
import { useAppStore } from "./appStore";

const taskService = new TaskService(new TaskRepository(getDb()));
const categoryService = new CategoryService(new CategoryRepository(getDb()));

export interface CreateDraft {
  plannedStart?: number;
  plannedEnd?: number;
}

interface TaskState {
  tasks: Task[];
  categories: Category[];
  loading: boolean;
  selectedTaskId: number | null;
  isCreateOpen: boolean;
  editingTaskId: number | null;
  createDraft: CreateDraft | null;

  load: () => Promise<void>;
  createTask: (input: TaskCreateInput) => Promise<void>;
  updateTask: (id: number, input: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  completeTask: (id: number) => Promise<void>;
  cancelTask: (id: number) => Promise<void>;
  changeCategory: (id: number, categoryId: number | null) => Promise<void>;
  changeEstimatedDuration: (id: number, seconds: number | null) => Promise<void>;

  selectTask: (id: number | null) => void;
  openCreate: (draft?: CreateDraft | null) => void;
  closeCreate: () => void;
  openEdit: (id: number) => void;
  closeEdit: () => void;
}

/** 操作失败统一提示（设计文档 8：写操作失败保持原状态，不崩溃）。 */
function fail(message: string): void {
  useAppStore.getState().pushToast("error", message);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  categories: [],
  loading: false,
  selectedTaskId: null,
  isCreateOpen: false,
  editingTaskId: null,
  createDraft: null,

  load: async () => {
    set({ loading: true });
    try {
      const [tasks, categories] = await Promise.all([
        taskService.getTodayTasks(),
        categoryService.findAll(),
      ]);
      set({ tasks, categories });
    } catch {
      fail("加载任务失败");
    } finally {
      set({ loading: false });
    }
  },

  createTask: async (input) => {
    try {
      await taskService.createTask(input);
      set({ isCreateOpen: false });
      await get().load();
    } catch {
      fail("创建任务失败");
    }
  },

  updateTask: async (id, input) => {
    try {
      await taskService.updateTask(id, input);
      set({ editingTaskId: null });
      await get().load();
    } catch {
      fail("保存任务失败");
    }
  },

  deleteTask: async (id) => {
    try {
      await taskService.deleteTask(id);
      set({ selectedTaskId: null });
      await get().load();
    } catch {
      fail("删除任务失败");
    }
  },

  completeTask: async (id) => {
    try {
      await taskService.completeTask(id);
      await get().load();
    } catch {
      fail("完成任务失败");
    }
  },

  cancelTask: async (id) => {
    try {
      await taskService.cancelTask(id);
      await get().load();
    } catch {
      fail("取消任务失败");
    }
  },

  changeCategory: async (id, categoryId) => {
    try {
      await taskService.changeCategory(id, categoryId);
      await get().load();
    } catch {
      fail("修改类别失败");
    }
  },

  changeEstimatedDuration: async (id, seconds) => {
    try {
      await taskService.changeEstimatedDuration(id, seconds);
      await get().load();
    } catch {
      fail("修改预计时长失败");
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),
  openCreate: (draft = null) => set({ isCreateOpen: true, createDraft: draft }),
  closeCreate: () => set({ isCreateOpen: false, createDraft: null }),
  openEdit: (id) => set({ editingTaskId: id }),
  closeEdit: () => set({ editingTaskId: null }),
}));
