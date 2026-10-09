import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { goals, projects, tasks, longTermPhases, notes } from "./schema";

export const taskPlanningRanges = sqliteTable("task_planning_ranges", {
  taskId: integer("task_id").primaryKey().references(() => tasks.id, { onDelete: "cascade" }),
  startDay: text("start_day").notNull(), endDay: text("end_day").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const planningMilestones = sqliteTable("planning_milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  phaseId: integer("phase_id").references(() => longTermPhases.id, { onDelete: "set null" }),
  title: text("title").notNull(), targetDay: text("target_day").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false), updatedAt: integer("updated_at").notNull(),
});
export const inboxLinks = sqliteTable("inbox_links", {
  noteId: integer("note_id").primaryKey().references(() => notes.id, { onDelete: "cascade" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  itemKey: text("item_key"), processedAt: integer("processed_at").notNull(),
});
