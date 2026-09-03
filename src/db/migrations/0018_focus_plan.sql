-- v2.0.x Focus 双层参数：本次计划写回 session（不回写 Settings 默认）
-- - planned_break_minutes / planned_break_count / planned_pomodoro_count：
--   本次循环计划（休息时长、休息次数、番茄数量），供统计比较计划 vs 实际
ALTER TABLE `focus_sessions` ADD COLUMN `planned_break_minutes` integer;
--> statement-breakpoint
ALTER TABLE `focus_sessions` ADD COLUMN `planned_break_count` integer;
--> statement-breakpoint
ALTER TABLE `focus_sessions` ADD COLUMN `planned_pomodoro_count` integer;
