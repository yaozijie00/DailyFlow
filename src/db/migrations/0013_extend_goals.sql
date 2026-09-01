-- V2 长期规划月视图：扩展 goals 表以支持「长期任务块」。
-- - start_date：开始日期（YYYY-MM-DD，可空；与 deadline 共同构成日期跨度）
-- - priority：优先级（high / medium / low，默认 medium）
-- - manual_progress：手动进度 0-100（可空；为 null 时按关联任务自动计算）
-- 复用现有 tasks.goal_id 关联与 GoalRepository 的进度聚合，不新建任务表。
ALTER TABLE `goals` ADD COLUMN `start_date` text;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `priority` text DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE `goals` ADD COLUMN `manual_progress` integer;
