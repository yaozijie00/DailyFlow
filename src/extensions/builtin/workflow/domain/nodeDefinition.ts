import type {
  PlannedEffect,
  ValidationIssue,
  WorkflowCapability,
  WorkflowExecutionContext,
  WorkflowNodeResult,
  WorkflowPreviewContext,
  WorkflowValidationContext,
} from "./types";

export type WorkflowNodePortDirection = "input" | "output";

export interface WorkflowNodePortDefinition {
  id: string;
  direction: WorkflowNodePortDirection;
  label?: string;
  maxConnections?: number;
}

export type WorkflowNodeConfigFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "file"
  | "folder"
  | "string-list"
  | "directory-tree";

export interface WorkflowNodeConfigField {
  key: string;
  label: string;
  type: WorkflowNodeConfigFieldType;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
}

export interface WorkflowNodeConfigSchema {
  fields: WorkflowNodeConfigField[];
}

export interface WorkflowNodeDefinition<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  version: number;
  category: string;
  title: string;
  description?: string;
  capabilities: WorkflowCapability[];
  ports: WorkflowNodePortDefinition[];
  configSchema: WorkflowNodeConfigSchema;
  idempotent?: boolean;
  validate(config: TConfig, context: WorkflowValidationContext): ValidationIssue[];
  preview(config: TConfig, context: WorkflowPreviewContext): Promise<PlannedEffect[]>;
  execute(config: TConfig, context: WorkflowExecutionContext): Promise<WorkflowNodeResult>;
}
