import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * 数据模型（4 张表）+ 外键关系
 * - 时长单位：秒
 * - 时间戳单位：Unix 毫秒
 * - 日期：本地 YYYY-MM-DD
 *
 * 关系：
 *   categories 1 ── * tasks（category_id，删除类别时置空）
 *   tasks     1 ── * focus_sessions（task_id，删除任务时级联删除）
 */

// sort_order：用户自定义的类别排序权重（迁移 0001 新增并回填默认值）
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("TODO"),
  estimatedDuration: integer("estimated_duration"),
  plannedStart: integer("planned_start"),
  plannedEnd: integer("planned_end"),
  actualDuration: integer("actual_duration").notNull().default(0),
  scheduledDate: text("scheduled_date").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
  notes: text("notes"),
  /** 任务列表自定义顺序（按时间重排 / 手动拖动调整） */
  sortOrder: integer("sort_order").notNull().default(0),
});

export const focusSessions = sqliteTable("focus_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // task_id 可空 + ON DELETE SET NULL：删除任务不再级联删除历史专注记录（统计保留）
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  // 专注开始时刻任务所属类别的快照（无 FK；类别删除后 JOIN 不到 → 归入「已删除类别」）
  categoryId: integer("category_id"),
  plannedDuration: integer("planned_duration").notNull(),
  actualDuration: integer("actual_duration").notNull().default(0),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const newsItems = sqliteTable("news_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guid: text("guid").unique(),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  imageUrl: text("image_url"),
  summary: text("summary"),
  category: text("category").notNull(),
  publishedAt: integer("published_at"),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const newsSources = sqliteTable("news_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  category: text("category").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const achievementProgress = sqliteTable("achievement_progress", {
  achievementId: text("achievement_id").primaryKey(),
  unlocked: integer("unlocked", { mode: "boolean" }).notNull().default(false),
  unlockedAt: integer("unlocked_at"),
});
