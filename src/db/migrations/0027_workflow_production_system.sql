-- Workflow 生产自动化：规范中心、应用注册表、运行 Context 与外部长期项目关联。
CREATE TABLE IF NOT EXISTS `workflow_standards` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `description` text,
  `version` integer NOT NULL DEFAULT 1,
  `enabled` integer NOT NULL DEFAULT 1,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workflow_standard_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `standard_id` text NOT NULL REFERENCES `workflow_standards`(`id`) ON UPDATE no action ON DELETE cascade,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `rule_type` text NOT NULL DEFAULT 'template',
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workflow_standard_rules_standard`
ON `workflow_standard_rules` (`standard_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workflow_folder_nodes` (
  `id` text PRIMARY KEY NOT NULL,
  `standard_id` text NOT NULL REFERENCES `workflow_standards`(`id`) ON UPDATE no action ON DELETE cascade,
  `parent_id` text,
  `name_template` text NOT NULL,
  `context_key` text,
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workflow_folder_nodes_standard`
ON `workflow_folder_nodes` (`standard_id`, `sort_order`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workflow_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `executable_path` text NOT NULL,
  `default_args_json` text NOT NULL DEFAULT '[]',
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `workflow_standards`
(`id`, `name`, `type`, `description`, `version`, `enabled`, `is_default`, `created_at`, `updated_at`)
VALUES
('standard.ue-environment-folders', 'UE Environment 文件夹规范', 'folder', '用于 UE 环境项目初始化；只补全缺失目录，不覆盖已有内容。', 1, 1, 1, 0, 0),
('standard.ue-naming', 'UE Environment 命名规范', 'naming', '统一项目、软件工程、材质、贴图和版本命名。', 1, 1, 1, 0, 0);
--> statement-breakpoint
INSERT OR IGNORE INTO `workflow_folder_nodes`
(`id`, `standard_id`, `parent_id`, `name_template`, `context_key`, `sort_order`)
VALUES
('folder.ue.root', 'standard.ue-environment-folders', NULL, 'PJ_{ProjectName}', 'ProjectRoot', 0),
('folder.ue.ue', 'standard.ue-environment-folders', 'folder.ue.root', 'UE_{ProjectName}', 'UEPath', 1),
('folder.ue.sd', 'standard.ue-environment-folders', 'folder.ue.root', 'SD_{ProjectName}', 'SDPath', 2),
('folder.ue.blender', 'standard.ue-environment-folders', 'folder.ue.root', 'Blender_{ProjectName}', 'BlenderPath', 3),
('folder.ue.reference', 'standard.ue-environment-folders', 'folder.ue.root', 'Reference', 'ReferencePath', 4),
('folder.ue.reference.concept', 'standard.ue-environment-folders', 'folder.ue.reference', 'Concept', NULL, 5),
('folder.ue.reference.photo', 'standard.ue-environment-folders', 'folder.ue.reference', 'Photo', NULL, 6),
('folder.ue.reference.material', 'standard.ue-environment-folders', 'folder.ue.reference', 'Material', NULL, 7),
('folder.ue.export', 'standard.ue-environment-folders', 'folder.ue.root', 'Export', 'ExportPath', 8),
('folder.ue.export.mesh', 'standard.ue-environment-folders', 'folder.ue.export', 'Mesh', NULL, 9),
('folder.ue.export.texture', 'standard.ue-environment-folders', 'folder.ue.export', 'Texture', NULL, 10),
('folder.ue.documents', 'standard.ue-environment-folders', 'folder.ue.root', 'Documents', 'DocumentsPath', 11);
--> statement-breakpoint
INSERT OR IGNORE INTO `workflow_standard_rules`
(`id`, `standard_id`, `key`, `value`, `rule_type`, `sort_order`)
VALUES
('rule.ue.project-root', 'standard.ue-naming', 'ProjectRoot', 'PJ_{ProjectName}', 'template', 0),
('rule.ue.project', 'standard.ue-naming', 'UEProject', 'UE_{ProjectName}', 'template', 1),
('rule.ue.sd', 'standard.ue-naming', 'SubstanceDesigner', 'SD_{ProjectName}', 'template', 2),
('rule.ue.blender', 'standard.ue-naming', 'Blender', 'Blender_{ProjectName}', 'template', 3),
('rule.ue.material', 'standard.ue-naming', 'Material', 'M_{AssetName}', 'template', 4),
('rule.ue.texture', 'standard.ue-naming', 'Texture', 'T_{AssetName}_{Type}', 'template', 5),
('rule.ue.version', 'standard.ue-naming', 'Version', '{AssetName}_v{Version}', 'template', 6);
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `external_project_id` integer;
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `context_json` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `standard_snapshots_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `workflow_runs` SET `updated_at` = `created_at` WHERE `updated_at` = 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workflow_runs_external_project`
ON `workflow_runs` (`external_project_id`, `created_at`);
