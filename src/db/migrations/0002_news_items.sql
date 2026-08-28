CREATE TABLE IF NOT EXISTS `news_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guid` text,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`image_url` text,
	`summary` text,
	`category` text NOT NULL,
	`published_at` integer,
	`is_read` integer DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `news_items_guid_unique` ON `news_items` (`guid`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `news_items_url_unique` ON `news_items` (`url`);
