ALTER TABLE `categories` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `categories` SET `sort_order` = `id`;