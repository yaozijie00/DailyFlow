import { create } from "zustand";
import { getDb } from "../db/db";
import { TaskRepository, type Task, type UpdateTaskInput } from "../db/repositories/taskRepository";
import { CategoryRepository, type Category } from "../db/repositories/categoryRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { NoteRepository } from "../db/repositories/noteRepository";
import { TaskService, type TaskCreateInput } from "../services/taskService";
import { CategoryService } from "../services/categoryService";
import { NoteService } from "../services/noteService";
import { evaluateAndNotify } from "../services/achievementRuntime";
import { convertTaskToNote } from "../lib/noteConvert";
import { undoManager } from "../lib/undoManager";
import { todayString, yesterdayString } from "../lib/date";
import { useAppStore } from "./appStore";
import { useNoteStore } from "./noteStore";

const taskService = new TaskService(
  new TaskRepository(getDb()),
  new FocusSessionRepository(getDb()),
);
/** 共享任务服务单例（详情面板等只读查询复用，避免重复实例化）。 */
export { taskService };
const categoryService = new CategoryService(new CategoryRepository(getDb()));
const noteService = new NoteService(new NoteRepository(getDb()));

export interface CreateDraft {
  plannedStart?: number;
  plannedEnd?: number;
}

interface TaskState {
  tasks: Task[];
  categories: Category[];
  loading: boolean;
  /** 昨日未完成任务（逾期结转横幅；仅查看「今天」时有意义） */
  overdue: Task[];
  /** 当前查看的日期（YYYY-MM-DD），今日页据此加载任务/时间轴 */
  selectedDate: string;
  selectedTaskId: number | null;
  isCreateOpen: boolean;
  editingTaskId: number | null;
  createDraft: CreateDraft | null;
  /** 任务列表 → 时间轴拖拽中的瞬时状态（不落库，松开/取消后清空）。 */
  taskDrag: { taskId: number } | null;

  load: () => Promise<void>;
  /** 加载「今天」任务（专注页使用，始终今天） */
  loadToday: () => Promise<void>;
  /** 加载昨日未完成任务（逾期结转横幅用；非「今天」视图时清空） */
  loadOverdue: () => Promise<void>;
  /** 把昨日未完成任务结转/推迟到今天（一次拖动 = 一次批量 Undo；传空数组=全部结转） */
  carryOver: (taskIds: number[]) => Promise<void>;
  /** 标题模糊搜索（命令面板/全局查找） */
  searchTasks: (query: string) => Promise<Task[]>;
  /** 快速捕获：在指定日期创建任务（不切换当前视图）；成功返回 true */
  createScheduledTask: (input: {
    title: string;
    scheduledDate: string;
    plannedStart?: number | null;
    plannedEnd?: number | null;
    estimatedDuration?: number | null;
    categoryId?: number | null;
    courseId?: number | null;
  }) => Promise<boolean>;
  /** 拆分子任务（v1.8）：继承父任务日期/分类/目标/项目，挂到 parent_id 下 */
  createSubtask: (parent: Task, title: string) => Promise<void>;
  setSelectedDate: (date: string) => void;
  goToToday: () => void;
  createTask: (input: TaskCreateInput) => Promise<void>;
  updateTask: (id: number, input: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  /** 任务 → 便签（反向拖拽）：转成 active 便签并删除任务行（保留专注历史） */
  convertToNote: (id: number) => Promise<void>;
  completeTask: (id: number) => Promise<void>;
  toggleComplete: (id: number) => Promise<void>;
  cancelTask: (id: number) => Promise<void>;
  reorderTasks: (orderedIds: number[]) => Promise<void>;
  changeCategory: (id: number, categoryId: number | null) => Promise<void>;
  changeEstimatedDuration: (id: number, seconds: number | null) => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  renameCategory: (id: number, name: string) => Promise<void>;
  changeCategoryColor: (id: number, color: string) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  moveCategory: (id: number, direction: -1 | 1) => Promise<void>;
  startTaskDrag: (taskId: number) => void;
  endTaskDrag: () => void;

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
  overdue: [],
  selectedDate: todayString(),
  selectedTaskId: null,
  isCreateOpen: false,
  editingTaskId: null,
  createDraft: null,
  taskDrag: null,

  load: async () => {
    set({ loading: true });
    try {
      const [tasks, categories] = await Promise.all([
        taskService.getTasksByDate(get().selectedDate),
        categoryService.findAll(),
      ]);
      set({ tasks, categories });
    } catch {
      fail("加载任务失败");
    } finally {
      set({ loading: false });
    }
  },

  loadToday: async () => {
    set({ selectedDate: todayString() });
    await get().load();
  },

  loadOverdue: async () => {
    if (get().selectedDate !== todayString()) {
      set({ overdue: [] });
      return;
    }
    try {
      const rows = await taskService.getUnfinishedTasksByDate(yesterdayString());
      set({ overdue: rows });
    } catch {
      set({ overdue: [] });
    }
  },

  carryOver: async (taskIds) => {
    const pending =
      taskIds.length === 0
        ? get().overdue
        : get().overdue.filter((t) => taskIds.includes(t.id));
    if (pending.length === 0) return;
    const today = todayString();
    try {
      // 一次批量 Undo：全部结转 = 一个撤销动作（scheduledDate 已纳入可撤销字段）
      await undoManager.withBatchAsync(async () => {
        for (const t of pending) {
          await taskService.updateTask(t.id, { scheduledDate: today });
        }
      });
      await get().load();
      set({ overdue: [] });
      useAppStore
        .getState()
        .pushToast("success", `已结转 ${pending.length} 项任务到今天（可撤销）`);
    } catch {
      fail("结转任务失败");
    }
  },

  setSelectedDate: (date) => {
    if (!date || date === get().selectedDate) return;
    set({ selectedDate: date, selectedTaskId: null });
    void get().load();
  },

  searchTasks: async (query) => {
    try {
      return await taskService.searchTasks(query, 15);
    } catch {
      return [];
    }
  },

  createScheduledTask: async (input) => {
    try {
      await taskService.createTask({
        title: input.title,
        scheduledDate: input.scheduledDate,
        plannedStart: input.plannedStart ?? null,
        plannedEnd: input.plannedEnd ?? null,
        estimatedDuration: input.estimatedDuration ?? null,
        categoryId: input.categoryId ?? null,
        courseId: input.courseId ?? null,
      });
      if (get().selectedDate === input.scheduledDate) {
        await get().load();
      }
      useAppStore.getState().pushToast("success", "任务已创建");
      return true;
    } catch {
      fail("创建任务失败");
      return false;
    }
  },

  createSubtask: async (parent, title) => {
    const t = title.trim();
    if (!t) return;
    try {
      await taskService.createTask({
        title: t,
        scheduledDate: parent.scheduledDate,
        categoryId: parent.categoryId,
        goalId: parent.goalId,
        projectId: parent.projectId,
        parentId: parent.id,
      });
      await get().load();
    } catch {
      fail("添加子任务失败");
    }
  },

  goToToday: () => {
    set({ selectedDate: todayString(), selectedTaskId: null });
    void get().load();
  },

  createTask: async (input) => {
    try {
      await taskService.createTask({ ...input, scheduledDate: get().selectedDate });
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
      useAppStore.getState().pushToast("success", "任务已删除", {
        label: "撤销",
        onClick: () => {
          void (async () => {
            try {
              await undoManager.undo();
              await get().load();
            } catch {
              fail("撤销失败，数据没有改变，请重试");
            }
          })();
        },
      });
    } catch {
      fail("删除任务失败");
    }
  },

  convertToNote: async (id) => {
    try {
      // 任务 → 便签 作为一次 Undo 复合操作（创建便签 + 删除任务，一次撤销整体还原）
      const ok = await undoManager.withBatchAsync(() =>
        convertTaskToNote(
          id,
          get().tasks,
          (input) => noteService.create(input),
          (taskId) => taskService.deleteTaskKeepSessions(taskId),
          (noteId) => noteService.delete(noteId),
        ),
      );
      if (!ok) {
        fail("转为便签失败");
        return;
      }
      set({ selectedTaskId: null });
      await get().load();
      await useNoteStore.getState().load();
    } catch {
      fail("转为便签失败");
    }
  },

  completeTask: async (id) => {
    try {
      await taskService.completeTask(id);
      await get().load();
      // 任务类成就（完成任务数 / 单日任务）在任务变更后评估
      void evaluateAndNotify();
    } catch {
      fail("完成任务失败");
    }
  },

  toggleComplete: async (id) => {
    try {
      await taskService.toggleComplete(id);
      await get().load();
      void evaluateAndNotify();
    } catch {
      fail("切换任务状态失败");
    }
  },

  cancelTask: async (id) => {
    try {
      await taskService.cancelTask(id);
      await get().load();
      void evaluateAndNotify();
    } catch {
      fail("取消任务失败");
    }
  },

  reorderTasks: async (orderedIds) => {
    try {
      await taskService.reorderTasks(orderedIds);
      await get().load();
    } catch {
      fail("调整任务顺序失败");
    }
  },

  changeCategory: async (id, categoryId) => {
    try {
      await taskService.changeCategory(id, categoryId);
      await get().load();
    } catch {
      fail("修改分类失败");
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

  createCategory: async (name) => {
    try {
      await categoryService.create(name);
      await get().load();
    } catch {
      fail("创建分类失败");
    }
  },
  renameCategory: async (id, name) => {
    try {
      await categoryService.rename(id, name);
      await get().load();
    } catch {
      fail("修改分类失败");
    }
  },
  changeCategoryColor: async (id, color) => {
    try {
      await categoryService.changeColor(id, color);
      await get().load();
    } catch {
      fail("修改分类颜色失败");
    }
  },
  deleteCategory: async (id) => {
    try {
      await categoryService.delete(id);
      await get().load();
    } catch {
      fail("删除分类失败");
    }
  },
  moveCategory: async (id, direction: -1 | 1) => {
    try {
      const cats = get().categories;
      const idx = cats.findIndex((c) => c.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= cats.length) return;
      const ordered = cats.map((c) => c.id);
      [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
      await categoryService.reorder(ordered);
      await get().load();
    } catch {
      fail("调整分类顺序失败");
    }
  },

  selectTask: (id) => set({ selectedTaskId: id }),
  openCreate: (draft = null) => set({ isCreateOpen: true, createDraft: draft }),
  closeCreate: () => set({ isCreateOpen: false, createDraft: null }),
  openEdit: (id) => set({ editingTaskId: id }),
  closeEdit: () => set({ editingTaskId: null }),
  startTaskDrag: (taskId) => set({ taskDrag: { taskId } }),
  endTaskDrag: () => set({ taskDrag: null }),
}));
