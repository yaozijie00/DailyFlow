import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { goals, projects, tasks, focusSessions } from "./schema";

/** Additive metadata preserves the IDs consumed by Today and Workflow. */
export const planningMeta = sqliteTable("planning_meta", {
  key: text("key").primaryKey(),
  goalId: integer("goal_id").references(() => goals.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  lifecycle: text("lifecycle").notNull().default("idea"),
  pausedFrom: text("paused_from"),
  description: text("description").notNull().default(""),
  priority: text("priority").notNull().default("p2"),
  weeklyTargetMinutes: integer("weekly_target_minutes").notNull().default(0),
  targetDate: text("target_date"),
  manualProgress: integer("manual_progress"),
  nextTaskId: integer("next_task_id").references(() => tasks.id, { onDelete: "set null" }),
  preparationJson: text("preparation_json").notNull().default("[]"),
  projectFolder: text("project_folder"),
  workflowRunId: text("workflow_run_id"),
  archivedAt: integer("archived_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const planningWeeks = sqliteTable("planning_weeks", {
  itemKey: text("item_key").notNull().references(() => planningMeta.key, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  originalMinutes: integer("original_minutes").notNull(),
  targetMinutes: integer("target_minutes").notNull(),
  intention: text("intention").notNull().default(""),
  reason: text("reason").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.itemKey, table.weekStart] })]);

export const planningChanges = sqliteTable("planning_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }), itemKey: text("item_key").notNull(),
  field: text("field").notNull(), oldValue: text("old_value"), newValue: text("new_value"),
  reason: text("reason").notNull().default(""), createdAt: integer("created_at").notNull(),
});

export const planningReviews = sqliteTable("planning_reviews", {
  id: text("id").primaryKey(), kind: text("kind").notNull(),
  periodStart: text("period_start").notNull(), periodEnd: text("period_end").notNull(),
  itemKey: text("item_key"), snapshotJson: text("snapshot_json").notNull(),
  decisionsJson: text("decisions_json").notNull(), note: text("note").notNull().default(""),
  confirmedAt: integer("confirmed_at").notNull(),
});

export const focusAttributions = sqliteTable("focus_attributions", {
  sessionId: integer("session_id").primaryKey().references(() => focusSessions.id, { onDelete: "cascade" }),
  goalId: integer("goal_id"), projectId: integer("project_id"), phaseId: integer("phase_id"),
  inferred: integer("inferred", { mode: "boolean" }).notNull().default(false),
});
