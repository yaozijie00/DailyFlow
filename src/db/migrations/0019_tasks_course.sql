-- v2.0.x 课程完成状态：tasks.course_id（「加入今日」生成的任务归属课程）
-- 课程每周完成率 = 本周该课程被按时完成任务数 / 应出现的时段数
ALTER TABLE `tasks` ADD COLUMN `course_id` integer REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `idx_tasks_course_id` ON `tasks` (`course_id`);
