import { describe, expect, it } from "vitest";
import type { WorkflowVariableDefinition } from "./types";
import {
  redactSensitiveValues,
  resolveConfigTemplates,
  resolveTemplate,
  validateVariableDefinitions,
  validateVariableValues,
} from "./variables";

const definitions: WorkflowVariableDefinition[] = [
  { key: "project_name", label: "项目名称", type: "text", required: true },
  { key: "root", label: "根目录", type: "folder", required: true },
  { key: "count", label: "数量", type: "number", required: false, defaultValue: 1 },
  { key: "private_key", label: "密钥", type: "text", required: false, sensitive: true },
];

describe("workflow variables", () => {
  it("validates unique keys, key format, select options and default values", () => {
    expect(validateVariableDefinitions(definitions)).toEqual([]);
    expect(
      validateVariableDefinitions([
        ...definitions,
        { key: "project_name", label: "重复", type: "text", required: false },
        { key: "Bad-Key", label: "非法", type: "text", required: false },
        { key: "kind", label: "类型", type: "select", required: true, options: [] },
        { key: "enabled", label: "启用", type: "boolean", required: false, defaultValue: "yes" },
      ]),
    ).toHaveLength(4);
  });

  it("applies defaults and validates required values, types and absolute paths", () => {
    const valid = validateVariableValues(definitions, {
      project_name: "DailyFlow",
      root: "D:/Projects",
    });
    expect(valid.issues).toEqual([]);
    expect(valid.values).toEqual({ project_name: "DailyFlow", root: "D:\\Projects", count: 1 });

    const invalid = validateVariableValues(definitions, {
      project_name: "",
      root: "relative/path",
      count: "one" as never,
    });
    expect(invalid.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(["project_name", "root", "count"]),
    );
  });

  it("resolves known placeholders and rejects unknown or absent placeholders", () => {
    expect(
      resolveTemplate("{{root}}\\{{project_name}}", {
        root: "D:\\Projects",
        project_name: "DailyFlow",
      }, definitions),
    ).toEqual({ ok: true, value: "D:\\Projects\\DailyFlow" });

    expect(resolveTemplate("{{unknown}}", {}, definitions)).toMatchObject({ ok: false });
    expect(resolveTemplate("{{project_name}}", {}, definitions)).toMatchObject({ ok: false });
  });

  it("resolves strings recursively without mutating the source config", () => {
    const source = {
      path: "{{root}}/{{project_name}}",
      entries: ["src", "docs/{{project_name}}"],
      nested: { count: 2, enabled: true },
    };
    const result = resolveConfigTemplates(
      source,
      { root: "D:\\Projects", project_name: "DailyFlow" },
      definitions,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        path: "D:\\Projects/DailyFlow",
        entries: ["src", "docs/DailyFlow"],
        nested: { count: 2, enabled: true },
      },
    });
    expect(source.path).toBe("{{root}}/{{project_name}}");
  });

  it("redacts sensitive values while preserving ordinary run inputs", () => {
    expect(
      redactSensitiveValues(
        { project_name: "DailyFlow", private_key: "secret", count: 2 },
        definitions,
      ),
    ).toEqual({ project_name: "DailyFlow", private_key: "***", count: 2 });
  });
});
