-- v2.3.x Workflow Extension 专属数据（基础设施表；Repository 属 Workflow Extension，经注入 Storage 访问）
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version` integer NOT NULL DEFAULT 1,
	`tags_json` text NOT NULL DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`position_x` integer NOT NULL DEFAULT 0,
	`position_y` integer NOT NULL DEFAULT 0,
	`config_json` text NOT NULL DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_nodes_wf` ON `workflow_nodes` (`workflow_id`);
--> statement-breakpoint
CREATE TABLE `workflow_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_edges_wf` ON `workflow_edges` (`workflow_id`);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	`task_id` integer,
	`state` text NOT NULL DEFAULT 'pending',
	`current_node_id` text,
	`started_at` integer,
	`completed_at` integer,
	`error_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_wf` ON `workflow_runs` (`workflow_id`);
