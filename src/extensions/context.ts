import { EXTENSION_API_VERSION, type CoreContext, type LegacyCourseSource, type LegacyWeeklySlotSource } from "./types";
import { useTaskStore } from "../stores/taskStore";
import { todayString } from "../lib/date";
import { getDb } from "../db/db";
import { CourseRepository } from "../db/repositories/courseRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { TaskService } from "../services/taskService";

/**
 * 构造 Core Context（Extension Host 属于 Core）。
 * Extension 只能通过这里访问 Core —— 不允许 import Core 内部实现。
 * 实现细节变化不影响 Extension；API 语义随 EXTENSION_API_VERSION 演进。
 */
export function createCoreContext(): CoreContext {
  const taskSvc = new TaskService(
    new TaskRepository(getDb()),
    new FocusSessionRepository(getDb()),
  );
  const taskRepo = new TaskRepository(getDb());
  return {
    apiVersion: EXTENSION_API_VERSION,
    tasks: {
      create: async (input) => {
        try {
          return await useTaskStore.getState().createScheduledTask({
            title: input.title,
            scheduledDate: input.scheduledDate ?? todayString(),
            plannedStart: input.plannedStart ?? null,
            plannedEnd: input.plannedEnd ?? null,
            estimatedDuration: input.estimatedDuration ?? null,
            categoryId: input.categoryId ?? null,
            courseId: input.courseId ?? null,
          });
        } catch {
          return false;
        }
      },
      createWithId: async (input) => {
        try {
          const task = await taskSvc.createTask({
            title: input.title,
            scheduledDate: input.scheduledDate ?? todayString(),
            plannedStart: input.plannedStart ?? null,
            plannedEnd: input.plannedEnd ?? null,
            estimatedDuration: input.estimatedDuration ?? null,
            categoryId: input.categoryId ?? null,
            // 课程关联由课程扩展写 task_links，不再写入 Core 的 course_id
            courseId: null,
          });
          if (!task) return { ok: false, id: null };
          const st = useTaskStore.getState();
          if (st.selectedDate === task.scheduledDate) {
            await st.load(); // 今日视图即时刷新
          }
          return { ok: true, id: task.id };
        } catch {
          return { ok: false, id: null };
        }
      },
      listByIds: async (ids) => {
        try {
          const rows = await taskRepo.listByIds(ids);
          return rows.map((r) => ({ id: r.id, status: r.status }));
        } catch {
          return [];
        }
      },
      complete: async (taskId) => {
        try {
          // silent：Workflow Finish→Task 完成属系统动作，不记录撤销——
          // 否则 Ctrl+Z 撤销会让任务回 TODO 而 WorkflowRun 仍 completed（状态矛盾）
          const updated = await taskSvc.completeTask(taskId, true);
          if (!updated) return false;
          const st = useTaskStore.getState();
          if (st.selectedDate === updated.scheduledDate) {
            await st.load(); // 今日视图即时刷新
          }
          const { evaluateAndNotify } = await import("../services/achievementRuntime");
          void evaluateAndNotify(); // 任务类成就即时评估
          return true;
        } catch {
          return false;
        }
      },
      listByDate: async (date) => {
        try {
          const rows = await taskSvc.getTasksByDate(date);
          return rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
        } catch {
          return [];
        }
      },
    },
    // Core 旧数据只读提供：课程 Extension 首次初始化把历史数据迁入独立库
    legacy: {
      listCourses: async (): Promise<LegacyCourseSource[]> => {
        try {
          const rows = await new CourseRepository(getDb()).listCourses();
          return rows.map((r) => ({
            id: r.id,
            title: r.title,
            categoryId: r.categoryId ?? null,
            sortOrder: r.sortOrder,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }));
        } catch {
          return [];
        }
      },
      listSlots: async (): Promise<LegacyWeeklySlotSource[]> => {
        try {
          const rows = await new CourseRepository(getDb()).listSlotsView();
          return rows.map((r) => ({
            id: r.id,
            courseId: r.courseId ?? null,
            weekday: r.weekday,
            startMinutes: r.startMinutes,
            durationMinutes: r.durationMinutes,
            createdAt: r.createdAt,
          }));
        } catch {
          return [];
        }
      },
      listTaskCoursePairs: async () => {
        try {
          return await taskRepo.listLegacyCoursePairs();
        } catch {
          return [];
        }
      },
    },
  };
}
