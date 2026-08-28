ALTER TABLE `categories` ADD `color` text;
--> statement-breakpoint
UPDATE `categories` SET `color` = CASE (`sort_order` % 12)
  WHEN 0 THEN '#3b82f6'
  WHEN 1 THEN '#22c55e'
  WHEN 2 THEN '#a855f7'
  WHEN 3 THEN '#f97316'
  WHEN 4 THEN '#ef4444'
  WHEN 5 THEN '#06b6d4'
  WHEN 6 THEN '#ec4899'
  WHEN 7 THEN '#eab308'
  WHEN 8 THEN '#6366f1'
  WHEN 9 THEN '#f43f5e'
  WHEN 10 THEN '#92400e'
  ELSE '#84cc16'
END;
