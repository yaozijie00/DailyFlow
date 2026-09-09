export type WorkflowCapability =
  | "files.read"
  | "files.write"
  | "system.open"
  | "process.launch"
  | "process.execute"
  | "tasks.read"
  | "tasks.write";

export type WorkflowVariableType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "file"
  | "folder";

export type WorkflowVariableValue = string | number | boolean | null;
export type WorkflowVariableValues = Record<string, WorkflowVariableValue>;

export interface WorkflowVariableOption {
  label: string;
  value: string;
}

export interface WorkflowVariableDefinition {
  key: string;
  label: string;
  description?: string;
  type: WorkflowVariableType;
  required: boolean;
  defaultValue?: WorkflowVariableValue;
  options?: WorkflowVariableOption[];
  sensitive?: boolean;
  remember?: boolean;
}

export interface WorkflowNodeV2 {
  id: string;
  type: string;
  typeVersion: number;
  title: string;
  description?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowEdgeV2 {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface WorkflowV2 {
  id: string;
  schemaVersion: 2;
  name: string;
  description?: string;
  version: number;
  variables: WorkflowVariableDefinition[];
  nodes: WorkflowNodeV2[];
  edges: WorkflowEdgeV2[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  nodeId?: string;
  field?: string;
}

export type PlannedEffectKind =
  | "create-directory"
  | "create-file"
  | "copy-path"
  | "open-path"
  | "open-url"
  | "launch-process"
  | "execute-process"
  | "task-change"
  | "manual-step";

export interface PlannedEffect {
  id: string;
  nodeId: string;
  kind: PlannedEffectKind;
  title: string;
  description?: string;
  target?: string;
  conflict?: "none" | "fail" | "skip" | "overwrite" | "rename";
  destructive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WorkflowNodeResult {
  status: "completed" | "paused" | "failed";
  message?: string;
  retryable?: boolean;
  output?: Record<string, unknown>;
  affectedPaths?: string[];
}

export interface WorkflowExecutionContext {
  workflow: WorkflowV2;
  node: WorkflowNodeV2;
  variables: WorkflowVariableValues;
  resolvedConfig: Record<string, unknown>;
  trace: string[];
  signal?: AbortSignal;
}

export interface WorkflowPreviewContext {
  workflow: WorkflowV2;
  node: WorkflowNodeV2;
  variables: WorkflowVariableValues;
  resolvedConfig: Record<string, unknown>;
}

export interface WorkflowValidationContext {
  workflow: WorkflowV2;
  node: WorkflowNodeV2;
  variables: WorkflowVariableValues;
  resolvedConfig: Record<string, unknown>;
}
