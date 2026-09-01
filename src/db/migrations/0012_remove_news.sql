-- V1.4.1：彻底移除新闻功能（News）。历史库中存在的表与设置键一并清理（幂等，可安全重试）。
DROP TABLE IF EXISTS `news_items`;
--> statement-breakpoint
DROP TABLE IF EXISTS `news_sources`;
--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'news_refresh_interval';
