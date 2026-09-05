import { create } from "zustand";
import { getDb } from "../db/db";
import type { Course, SlotView } from "../db/repositories/courseRepository";
import { CourseService } from "../services/courseService";
import { TaskRepository } from "../db/repositories/taskRepository";
import { ExtensionCourseRepository } from "../extensions/builtin/course-schedule/data/repository";
import { useAppStore } from "./appStore";
import { undoManager } from "../lib/undoManager";

// 数据源：课程表 Extension 独立库（courses/weekly_slots 不再写入 Core 库）
const courseService = new CourseService(
  new ExtensionCourseRepository(),
  new TaskRepository(getDb()),
);

/** 共享课程服务单例。 */
export { courseService };

interface CourseState {
  courses: Course[];
  slots: SlotView[];
  loading: boolean;
  load: () => Promise<void>;
  createCourse: (title: string) => Promise<void>;
  deleteCourse: (id: number) => Promise<void>;
  addSlot: (courseId: number, weekday: number, startMinutes: number, durationMinutes?: number) => Promise<void>;
  /** 拖动/调整后单次提交（= 一次撤销） */
  moveSlot: (id: number, patch: { weekday?: number; startMinutes?: number; durationMinutes?: number }) => Promise<void>;
  deleteSlot: (id: number) => Promise<void>;
}

function undoToast(onOk: () => Promise<void>): void {
  void (async () => {
    try {
      await undoManager.undo();
      await onOk();
    } catch {
      useAppStore.getState().pushToast("error", "撤销失败，数据没有改变，请重试");
    }
  })();
}

export const useCourseStore = create<CourseState>((set, get) => ({
  courses: [],
  slots: [],
  loading: false,

  load: async () => {
    if (useAppStore.getState().dbStatus !== "ready") return;
    set({ loading: true });
    try {
      const [courses, slots] = await Promise.all([
        courseService.listCourses(),
        courseService.listSlots(),
      ]);
      set({ courses, slots, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createCourse: async (title) => {
    const t = title.trim();
    if (!t) return;
    try {
      await courseService.createCourse({ title: t });
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "创建课程失败");
    }
  },

  deleteCourse: async (id) => {
    try {
      await courseService.deleteCourse(id);
      await get().load();
      useAppStore.getState().pushToast("success", "课程已删除", {
        label: "撤销",
        onClick: () => undoToast(() => get().load()),
      });
    } catch {
      useAppStore.getState().pushToast("error", "删除课程失败");
    }
  },

  addSlot: async (courseId, weekday, startMinutes, durationMinutes) => {
    try {
      await courseService.addSlot({ courseId, weekday, startMinutes, durationMinutes });
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "添加课程安排失败");
    }
  },

  moveSlot: async (id, patch) => {
    try {
      await courseService.updateSlot(id, patch);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "调整课程安排失败");
    }
  },

  deleteSlot: async (id) => {
    try {
      await courseService.deleteSlot(id);
      await get().load();
      useAppStore.getState().pushToast("success", "已删除该次安排", {
        label: "撤销",
        onClick: () => undoToast(() => get().load()),
      });
    } catch {
      useAppStore.getState().pushToast("error", "删除课程安排失败");
    }
  },
}));
