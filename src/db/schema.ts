import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * 数据模型（7 张表）+ 外键关系
 * - 时长单位：秒
 * - 时间戳单位：Unix 毫秒
 * - 日期：本地 YYYY-MM-DD
 *
 * 关系：
 *   categories 1 ── * tasks（category_id，删除类别时置空）
 *   goals      1 ── * tasks（goal_id，删除目标时任务保留并置空）
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
  /** 关联的长期目标（删除目标时任务保留，goal_id 置空） */
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
  /** 重复规则（v1.6.2）：'' 不重复 / daily / weekdays / weekly / monthly；完成自动生成下一实例 */
  repeatRule: text("repeat_rule").notNull().default(""),
  /** 所属项目（v1.8 Goal→Project→Task；删除项目时置空） */
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  /**
   * 父任务（v1.8 Task Split；删除父任务时子任务保留并置空）。
   * 注意：自引用外键在 drizzle 初始化期不可用，FK 由迁移 0016 建立，
   * 删除置空行为由服务/仓库显式处理。
   */
  parentId: integer("parent_id"),
  /** 归属课程（2.0.x 课程表 → 任务；删除课程时置空） */
  courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
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
  /** 本次循环计划（2.0.x 双层参数；不回写 Settings）：休息时长/休息次数/番茄数量 */
  plannedBreakMinutes: integer("planned_break_minutes"),
  plannedBreakCount: integer("planned_break_count"),
  plannedPomodoroCount: integer("planned_pomodoro_count"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const achievementProgress = sqliteTable("achievement_progress", {
  achievementId: text("achievement_id").primaryKey(),
  unlocked: integer("unlocked", { mode: "boolean" }).notNull().default(false),
  unlockedAt: integer("unlocked_at"),
});

/**
 * 便签：独立于日期的「待办事项」——有想法但暂无执行时间，也不能忘记。
 * 状态：active（默认显示）/ arranged（已转为任务，折叠显示）/ completed（隐藏，可查看）。
 */
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
});

/**
 * 长期目标 / 长期任务块（V2 月视图）：
 * - 独立于日期的阶段性方向；月视图中按 start_date ~ deadline 渲染成跨天任务块；
 * - 状态：active（进行中）/ completed（已完成，保留历史）；
 * - 进度：manual_progress 非空时用手动值，否则按关联任务（tasks.goal_id）自动计算；
 * - 任务通过 tasks.goal_id 关联目标，用于进度统计。
 */
export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  /** 结束日期（本地 YYYY-MM-DD，可空；月视图中作为结束日期） */
  deadline: text("deadline"),
  /** 开始日期（本地 YYYY-MM-DD，可空；月视图中作为开始日期） */
  startDate: text("start_date"),
  /** 优先级：high / medium / low */
  priority: text("priority").notNull().default("medium"),
  /** 手动进度 0-100（可空；为 null 时按关联任务自动计算） */
  manualProgress: integer("manual_progress"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
});

/**
 * 项目（v1.8 Product Structure）：Goal 下的执行单元。
 * 关系：goals 1 ── * projects 1 ── * tasks（tasks.project_id）；
 * 目标进度仍按 tasks.goal_id 聚合（任务选项目时联动所属目标）。
 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** 所属长期目标（删除目标时保留项目并置空） */
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * 课程（2.0.x Course Schedule）：课程库条目，关联分类取色/标签。
 */
export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * 每周固定时段（课程表核心）：weekday 1=周一..7=周日；
 * start_minutes = 当天 0..1439 分钟；duration_minutes 时长。
 * 每条 slot 天然「每周重复」；删除课程时级联删除（迁移 0017 建立 FK）。
 */
export const weeklySlots = sqliteTable("weekly_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").references(() => courses.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(),
  startMinutes: integer("start_minutes").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  createdAt: integer("created_at").notNull(),
});
