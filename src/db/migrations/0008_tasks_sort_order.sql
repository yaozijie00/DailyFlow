ALTER TABLE `tasks` ADD COLUMN `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `tasks` SET `sort_order` = (
	SELECT COUNT(*) FROM `tasks` t2
	WHERE t2.scheduled_date = tasks.scheduled_date
		AND (
			(t2.planned_start IS NOT NULL AND (tasks.planned_start IS NULL OR t2.planned_start < tasks.planned_start))
			OR (t2.planned_start IS NULL AND tasks.planned_start IS NULL AND t2.id < tasks.id)
		)
);
