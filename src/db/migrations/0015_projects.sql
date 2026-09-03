-- v1.8 Product Structure：Goal → Project → Task 二级
-- - projects：目标下的项目（goal_id 可空，删除目标时保留项目并置空）
-- - tasks.project_id：任务归属项目（删除项目时置空，目标进度仍按 goal_id 聚合）
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
	`title` text NOT NULL,
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_goal_id` ON `projects` (`goal_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `project_id` integer REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`);
