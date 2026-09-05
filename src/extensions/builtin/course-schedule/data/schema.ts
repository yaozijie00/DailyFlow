import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * 课程表 Extension 独立库 schema（Rule 05：Extension 数据与 Core 分离）。
 * - 生产：独立 SQLite 文件（course-schedule.db）；
 * - courses/weekly_slots 为课程表自身数据；
 * - task_links：课程 ↔ Core Task 的引用映射（任务本体仍在 Core，二者是不同实体）。
 */

export const extCourses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** 兼容遗留列：迁移自 Core 的 category_id（新版本 UI 不再依赖，保留原值） */
  categoryId: integer("category_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const extWeeklySlots = sqliteTable("weekly_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id"),
  weekday: integer("weekday").notNull(),
  startMinutes: integer("start_minutes").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  createdAt: integer("created_at").notNull(),
});

export const extTaskLinks = sqliteTable("task_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull(),
  courseId: integer("course_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const extSchema = {
  courses: extCourses,
  weekly_slots: extWeeklySlots,
  task_links: extTaskLinks,
};

export type ExtCourse = typeof extCourses.$inferSelect;
export type ExtWeeklySlot = typeof extWeeklySlots.$inferSelect;
export type ExtTaskLink = typeof extTaskLinks.$inferSelect;
