ALTER TABLE `tasks` ADD COLUMN `goal_id` integer REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_goal_id` ON `tasks`(`goal_id`);
