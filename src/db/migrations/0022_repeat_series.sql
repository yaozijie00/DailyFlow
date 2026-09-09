ALTER TABLE `tasks` ADD COLUMN `repeat_source_id` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_tasks_repeat_occurrence`
ON `tasks` (`repeat_source_id`, `scheduled_date`)
WHERE `repeat_source_id` IS NOT NULL;
