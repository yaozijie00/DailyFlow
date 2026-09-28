-- 旧版 manual_progress 非空即表示使用手动进度；升级后保留原有显示语义。
UPDATE `goals`
SET `progress_mode` = 'manual'
WHERE `manual_progress` IS NOT NULL
  AND `progress_mode` = 'estimated';
