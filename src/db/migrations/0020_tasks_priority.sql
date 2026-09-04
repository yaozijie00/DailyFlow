-- v2.3.x 任务优先级：high / medium / low（默认 medium；迁移幂等，重复列自动跳过）
ALTER TABLE `tasks` ADD COLUMN `priority` text NOT NULL DEFAULT 'medium';
