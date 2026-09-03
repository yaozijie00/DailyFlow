-- v1.8 Task Split：tasks.parent_id（子任务）
-- - 拆分子任务：同一任务的子行挂在 parent_id 下（自引用）
-- - 删除父任务时子任务保留并置空（不级联，避免撤销丢数据）
ALTER TABLE `tasks` ADD COLUMN `parent_id` integer REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_id` ON `tasks` (`parent_id`);
