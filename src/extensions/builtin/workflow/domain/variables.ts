import type {
  ValidationIssue,
  WorkflowVariableDefinition,
  WorkflowVariableValue,
  WorkflowVariableValues,
} from "./types";

const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const PLACEHOLDER_PATTERN = /{{\s*([a-z][a-z0-9_]*)\s*}}/g;

function issue(code: string, message: string, field?: string): ValidationIssue {
  return { code, message, severity: "error", ...(field ? { field } : {}) };
}

function isAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\[^\\]/.test(value) || value.startsWith("/");
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    const drive = trimmed.slice(0, 2);
    const rest = trimmed.slice(2).replace(/[\\/]+/g, "\\");
    return drive + rest;
  }
  if (trimmed.startsWith("\\\\")) {
    return "\\\\" + trimmed.slice(2).replace(/[\\/]+/g, "\\");
  }
  return trimmed.replace(/\/{2,}/g, "/");
}

function valueIssue(
  definition: WorkflowVariableDefinition,
  value: WorkflowVariableValue,
): ValidationIssue | null {
  const field = definition.key;
  if (value === null || value === "") {
    return definition.required
      ? issue("variable.required", `${definition.label}为必填项`, field)
      : null;
  }
  if (definition.type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? null
      : issue("variable.number", `${definition.label}必须是有效数字`, field);
  }
  if (definition.type === "boolean") {
    return typeof value === "boolean"
      ? null
      : issue("variable.boolean", `${definition.label}必须是开关值`, field);
  }
  if (typeof value !== "string") {
    return issue("variable.string", `${definition.label}必须是文本`, field);
  }
  if (definition.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return issue("variable.date", `${definition.label}必须使用 YYYY-MM-DD 格式`, field);
  }
  if ((definition.type === "file" || definition.type === "folder") && !isAbsolutePath(value)) {
    return issue("variable.absolute-path", `${definition.label}必须是绝对路径`, field);
  }
  if (
    definition.type === "select" &&
    !(definition.options ?? []).some((option) => option.value === value)
  ) {
    return issue("variable.option", `${definition.label}不是允许的选项`, field);
  }
  return null;
}

export function validateVariableDefinitions(
  definitions: WorkflowVariableDefinition[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = new Set<string>();
  for (const definition of definitions) {
    if (!VARIABLE_KEY_PATTERN.test(definition.key)) {
      issues.push(
        issue(
          "variable.invalid-key",
          `变量键必须以小写字母开头且仅含小写字母、数字和下划线：${definition.key}`,
          definition.key,
        ),
      );
    }
    if (keys.has(definition.key)) {
      issues.push(issue("variable.duplicate-key", `变量键重复：${definition.key}`, definition.key));
    }
    keys.add(definition.key);
    if (definition.type === "select" && (definition.options?.length ?? 0) === 0) {
      issues.push(issue("variable.empty-options", `${definition.label}至少需要一个选项`, definition.key));
    }
    if (definition.defaultValue !== undefined) {
      const invalidDefault = valueIssue({ ...definition, required: true }, definition.defaultValue);
      if (invalidDefault) {
        issues.push(
          issue("variable.invalid-default", `${definition.label}的默认值类型不正确`, definition.key),
        );
      }
    }
  }
  return issues;
}

export function validateVariableValues(
  definitions: WorkflowVariableDefinition[],
  input: WorkflowVariableValues,
): { values: WorkflowVariableValues; issues: ValidationIssue[] } {
  const values: WorkflowVariableValues = {};
  const issues: ValidationIssue[] = [];
  for (const definition of definitions) {
    const supplied = Object.prototype.hasOwnProperty.call(input, definition.key);
    const value = supplied ? input[definition.key] : (definition.defaultValue ?? null);
    const invalid = valueIssue(definition, value);
    if (invalid) {
      issues.push(invalid);
      continue;
    }
    if (value === null || value === "") continue;
    values[definition.key] =
      (definition.type === "file" || definition.type === "folder") && typeof value === "string"
        ? normalizePath(value)
        : value;
  }
  return { values, issues };
}

export type TemplateResolution<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export function resolveTemplate(
  template: string,
  values: WorkflowVariableValues,
  definitions: WorkflowVariableDefinition[],
): TemplateResolution<string> {
  const known = new Set(definitions.map((definition) => definition.key));
  const issues: ValidationIssue[] = [];
  const value = template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    if (!known.has(key)) {
      issues.push(issue("variable.unknown-reference", `引用了未定义变量：${key}`, key));
      return "";
    }
    const resolved = values[key];
    if (resolved === undefined || resolved === null || resolved === "") {
      issues.push(issue("variable.missing-reference", `变量尚未填写：${key}`, key));
      return "";
    }
    return String(resolved);
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

export function resolveConfigTemplates(
  config: Record<string, unknown>,
  values: WorkflowVariableValues,
  definitions: WorkflowVariableDefinition[],
): TemplateResolution<Record<string, unknown>> {
  const issues: ValidationIssue[] = [];
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      const result = resolveTemplate(value, values, definitions);
      if (!result.ok) {
        issues.push(...result.issues);
        return value;
      }
      return result.value;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    }
    return value;
  };
  const resolved = visit(config) as Record<string, unknown>;
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: resolved };
}

export function redactSensitiveValues(
  values: WorkflowVariableValues,
  definitions: WorkflowVariableDefinition[],
): WorkflowVariableValues {
  const sensitive = new Set(
    definitions.filter((definition) => definition.sensitive).map((definition) => definition.key),
  );
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, sensitive.has(key) ? "***" : value]),
  );
}
