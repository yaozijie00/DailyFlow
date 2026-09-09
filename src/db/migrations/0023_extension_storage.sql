CREATE TABLE IF NOT EXISTS `extension_storage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`extension_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_extension_storage_namespace`
ON `extension_storage` (`extension_id`, `key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `extension_storage_meta` (
	`extension_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL DEFAULT 0,
	`updated_at` integer NOT NULL
);
