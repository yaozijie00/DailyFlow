CREATE TABLE IF NOT EXISTS `focus_sessions_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer,
	`category_id` integer,
	`planned_duration` integer NOT NULL,
	`actual_duration` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`completed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT OR IGNORE INTO `focus_sessions_new`
	(`id`, `task_id`, `category_id`, `planned_duration`, `actual_duration`, `started_at`, `ended_at`, `completed`, `created_at`)
SELECT
	`fs`.`id`, `fs`.`task_id`,
	(SELECT `t`.`category_id` FROM `tasks` `t` WHERE `t`.`id` = `fs`.`task_id`),
	`fs`.`planned_duration`, `fs`.`actual_duration`, `fs`.`started_at`, `fs`.`ended_at`, `fs`.`completed`, `fs`.`created_at`
FROM `focus_sessions` `fs`;
--> statement-breakpoint
DROP TABLE IF EXISTS `focus_sessions`;
--> statement-breakpoint
ALTER TABLE `focus_sessions_new` RENAME TO `focus_sessions`;
