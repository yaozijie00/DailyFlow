ALTER TABLE `workflows` ADD COLUMN `schema_version` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `workflows` ADD COLUMN `variables_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `workflow_nodes` ADD COLUMN `type_version` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `workflow_edges` ADD COLUMN `source_port` text;
--> statement-breakpoint
ALTER TABLE `workflow_edges` ADD COLUMN `target_port` text;
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `workflow_version` integer;
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `workflow_snapshot_json` text;
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `variables_snapshot_json` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workflow_run_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	`node_id` text NOT NULL,
	`node_type` text NOT NULL,
	`sequence` integer NOT NULL,
	`state` text NOT NULL DEFAULT 'pending',
	`started_at` integer,
	`completed_at` integer,
	`output_json` text,
	`error_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_workflow_run_steps_sequence`
ON `workflow_run_steps` (`run_id`, `sequence`);
