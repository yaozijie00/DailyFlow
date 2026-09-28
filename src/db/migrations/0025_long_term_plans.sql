-- 将现有 goals 增量升级为长期计划；保留原有目标与任务数据。
ALTER TABLE `goals` ADD COLUMN `weekly_target_minutes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `progress_mode` text NOT NULL DEFAULT 'estimated';
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `estimated_completion_date` text;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `current_phase_id` integer;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `next_action` text;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `weekly_rhythm_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `paused_at` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `long_term_phases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `goal_id` integer NOT NULL REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
  `title` text NOT NULL,
  `sort_order` integer NOT NULL DEFAULT 0,
  `estimated_minutes` integer,
  `manual_progress` integer,
  `status` text NOT NULL DEFAULT 'not_started',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_long_term_phases_goal_id` ON `long_term_phases` (`goal_id`);
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `phase_id` integer REFERENCES `long_term_phases`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_phase_id` ON `tasks` (`phase_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `long_term_plan_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `goal_id` integer NOT NULL REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
  `field` text NOT NULL,
  `label` text NOT NULL,
  `old_value` text,
  `new_value` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_long_term_history_goal_id` ON `long_term_plan_history` (`goal_id`, `created_at`);
