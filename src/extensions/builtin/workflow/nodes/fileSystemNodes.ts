import type { WorkflowNodeDefinition } from "../domain/nodeDefinition";
import type { ValidationIssue } from "../domain/types";
import {
  workflowSystemBridge,
  type WorkflowConflictStrategy,
} from "../systemBridge";

type FileSystemBridge = Pick<
  typeof workflowSystemBridge,
  "inspectPaths" | "createDirectories" | "writeTextFile" | "copyPath"
>;

const ports = [
  { id: "in", direction: "input" as const, maxConnections: 1 },
  { id: "out", direction: "output" as const, maxConnections: 1 },
];

function requiredString(
  config: Record<string, unknown>,
  key: string,
  label: string,
  nodeId: string,
): ValidationIssue[] {
  return typeof config[key] === "string" && config[key].trim()
    ? []
    : [{ code: `files.${key}-required`, message: `请填写${label}`, severity: "error", nodeId, field: key }];
}

function conflictOf(value: unknown): WorkflowConflictStrategy {
  return value === "skip" || value === "overwrite" || value === "rename" ? value : "fail";
}

function joinPath(root: string, entry: string): string {
  const separator = root.includes("\\") || /^[a-zA-Z]:/.test(root) ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${entry.replace(/^[\\/]+/, "").replace(/[\\/]+/g, separator)}`;
}

function safeTreeEntries(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  if (!Array.isArray(config.entries) || config.entries.length === 0) {
    return [{ code: "files.entries-required", message: "请至少添加一个相对目录", severity: "error", nodeId, field: "entries" }];
  }
  const invalid = config.entries.find(
    (entry) =>
      typeof entry !== "string" ||
      !entry.trim() ||
      /^[a-zA-Z]:[\\/]/.test(entry) ||
      entry.startsWith("/") ||
      entry.split(/[\\/]/).includes(".."),
  );
  return invalid === undefined
    ? []
    : [{ code: "files.invalid-tree-entry", message: `目录层级必须使用安全的相对路径：${String(invalid)}`, severity: "error", nodeId, field: "entries" }];
}

export function createFileSystemNodeDefinitions(
  bridge: FileSystemBridge = workflowSystemBridge,
): WorkflowNodeDefinition[] {
  const createDirectory: WorkflowNodeDefinition = {
    type: "files.create-directory",
    version: 1,
    category: "files",
    title: "创建文件夹",
    capabilities: ["files.write"],
    ports,
    idempotent: true,
    configSchema: { fields: [{ key: "path", label: "文件夹路径", type: "folder", required: true }] },
    validate: (config, context) => requiredString(config, "path", "文件夹路径", context.node.id),
    preview: async (config, context) => {
      const path = String(config.path);
      const [inspection] = await bridge.inspectPaths([path]);
      return [{
        id: `${context.node.id}:directory`, nodeId: context.node.id, kind: "create-directory",
        title: context.node.title, target: path, conflict: inspection?.exists ? "skip" : "none",
      }];
    },
    execute: async (config) => {
      const [path] = await bridge.createDirectories([String(config.path)]);
      return { status: "completed", affectedPaths: path ? [path] : [] };
    },
  };

  const createTree: WorkflowNodeDefinition = {
    type: "files.create-directory-tree",
    version: 1,
    category: "files",
    title: "批量创建目录结构",
    capabilities: ["files.write"],
    ports,
    idempotent: true,
    configSchema: {
      fields: [
        { key: "root", label: "根目录", type: "folder", required: true },
        { key: "entries", label: "目录层级", type: "directory-tree", required: true },
      ],
    },
    validate: (config, context) => [
      ...requiredString(config, "root", "根目录", context.node.id),
      ...safeTreeEntries(config, context.node.id),
    ],
    preview: async (config, context) => {
      const root = String(config.root);
      const paths = (config.entries as string[]).map((entry) => joinPath(root, entry));
      const inspections = await bridge.inspectPaths(paths);
      return paths.map((path, index) => ({
        id: `${context.node.id}:directory:${index}`, nodeId: context.node.id,
        kind: "create-directory" as const, title: `创建 ${path}`, target: path,
        conflict: inspections[index]?.exists ? "skip" as const : "none" as const,
      }));
    },
    execute: async (config) => {
      const root = String(config.root);
      const paths = (config.entries as string[]).map((entry) => joinPath(root, entry));
      return { status: "completed", affectedPaths: await bridge.createDirectories(paths) };
    },
  };

  const createTextFile: WorkflowNodeDefinition = {
    type: "files.create-text-file",
    version: 1,
    category: "files",
    title: "创建文本文件",
    capabilities: ["files.write"],
    ports,
    configSchema: { fields: [
      { key: "path", label: "文件路径", type: "file", required: true },
      { key: "content", label: "文件内容", type: "textarea", required: true },
      { key: "conflict", label: "冲突策略", type: "select", defaultValue: "fail", options: [
        { label: "失败", value: "fail" }, { label: "跳过", value: "skip" },
        { label: "覆盖", value: "overwrite" }, { label: "自动重命名", value: "rename" },
      ] },
    ] },
    validate: (config, context) => requiredString(config, "path", "文件路径", context.node.id),
    preview: async (config, context) => {
      const path = String(config.path);
      const [inspection] = await bridge.inspectPaths([path]);
      const conflict = inspection?.exists ? conflictOf(config.conflict) : "none";
      return [{ id: `${context.node.id}:file`, nodeId: context.node.id, kind: "create-file", title: context.node.title, target: path, conflict, destructive: conflict === "overwrite" }];
    },
    execute: async (config) => {
      const result = await bridge.writeTextFile({ path: String(config.path), content: String(config.content ?? ""), conflict: conflictOf(config.conflict) });
      return { status: "completed", output: { outcome: result.outcome }, affectedPaths: [result.actualPath] };
    },
  };

  const copyPath: WorkflowNodeDefinition = {
    type: "files.copy-path",
    version: 1,
    category: "files",
    title: "复制文件或目录",
    capabilities: ["files.read", "files.write"],
    ports,
    configSchema: { fields: [
      { key: "source", label: "来源路径", type: "file", required: true },
      { key: "target", label: "目标路径", type: "file", required: true },
      { key: "conflict", label: "冲突策略", type: "select", defaultValue: "fail" },
    ] },
    validate: (config, context) => [
      ...requiredString(config, "source", "来源路径", context.node.id),
      ...requiredString(config, "target", "目标路径", context.node.id),
    ],
    preview: async (config, context) => {
      const source = String(config.source); const target = String(config.target);
      const [sourceState, targetState] = await bridge.inspectPaths([source, target]);
      const issues: ValidationIssue[] = sourceState?.exists ? [] : [{ code: "files.source-missing", message: `复制来源不存在：${source}`, severity: "error", nodeId: context.node.id, field: "source" }];
      if (issues.length) throw new Error(issues[0].message);
      const conflict = targetState?.exists ? conflictOf(config.conflict) : "none";
      return [{ id: `${context.node.id}:copy`, nodeId: context.node.id, kind: "copy-path", title: context.node.title, target, conflict, destructive: conflict === "overwrite", metadata: { source } }];
    },
    execute: async (config) => {
      const result = await bridge.copyPath({ source: String(config.source), target: String(config.target), conflict: conflictOf(config.conflict) });
      return { status: "completed", output: { outcome: result.outcome }, affectedPaths: [result.actualPath] };
    },
  };

  return [createDirectory, createTree, createTextFile, copyPath];
}
