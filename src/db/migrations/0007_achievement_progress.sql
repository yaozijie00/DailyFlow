CREATE TABLE IF NOT EXISTS `achievement_progress` (
	`achievement_id` text PRIMARY KEY NOT NULL,
	`unlocked` integer DEFAULT 0 NOT NULL,
	`unlocked_at` integer
);
