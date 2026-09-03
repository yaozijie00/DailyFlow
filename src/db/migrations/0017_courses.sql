-- v2.0.x Course Schedule：课程 + 每周固定时段
-- - courses：课程（可关联分类取色）
-- - weekly_slots：每周固定安排（weekday 1=周一..7=周日；start_minutes=当天分钟 0..1439；
--   duration_minutes=时长）；本质即「每周重复」
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category_id` integer REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	`sort_order` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_courses_category_id` ON `courses` (`category_id`);
--> statement-breakpoint
CREATE TABLE `weekly_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	`weekday` integer NOT NULL,
	`start_minutes` integer NOT NULL,
	`duration_minutes` integer NOT NULL DEFAULT 60,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_weekly_slots_course_id` ON `weekly_slots` (`course_id`);
