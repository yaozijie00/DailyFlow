-- 重复任务（v1.6.2）：tasks.repeat_rule
-- - '' 不重复（默认）
-- - daily / weekdays / weekly / monthly：完成任务时自动生成下一个实例
ALTER TABLE `tasks` ADD COLUMN `repeat_rule` text DEFAULT '' NOT NULL;
