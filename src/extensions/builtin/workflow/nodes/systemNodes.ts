import type { WorkflowNodeDefinition } from "../domain/nodeDefinition";
import { workflowSystemBridge } from "../systemBridge";

type SystemBridge = Pick<
  typeof workflowSystemBridge,
  "inspectPaths" | "openFile" | "openFolder" | "openUrl" | "launchProcess" | "executeProcess"
>;

const ports = [
  { id: "in", direction: "input" as const, maxConnections: 1 },
  { id: "out", direction: "output" as const, maxConnections: 1 },
];

function stringIssues(config: Record<string, unknown>, nodeId: string, fields: string[]) {
  return fields.flatMap((field) =>
    typeof config[field] === "string" && config[field].trim()
      ? []
      : [{ code: `system.${field}-required`, message: `缺少配置：${field}`, severity: "error" as const, nodeId, field }],
  );
}

function processInput(config: Record<string, unknown>) {
  return {
    executable: String(config.executable),
    arguments: Array.isArray(config.arguments)
      ? config.arguments.filter((value): value is string => typeof value === "string")
      : [],
    ...(typeof config.workingDirectory === "string" && config.workingDirectory.trim()
      ? { workingDirectory: config.workingDirectory }
      : {}),
  };
}

export function createSystemNodeDefinitions(
  bridge: SystemBridge = workflowSystemBridge,
  options: { allowCommandExecution?: boolean } = {},
): WorkflowNodeDefinition[] {
  const openPath = (kind: "file" | "folder"): WorkflowNodeDefinition => ({
    type: `system.open-${kind}`,
    version: 1,
    category: "system",
    title: kind === "file" ? "打开文件" : "打开文件夹",
    capabilities: ["files.read", "system.open"],
    ports,
    idempotent: true,
    configSchema: { fields: [{ key: "path", label: kind === "file" ? "文件路径" : "文件夹路径", type: kind, required: true }] },
    validate: (config, context) => stringIssues(config, context.node.id, ["path"]),
    preview: async (config, context) => {
      const path = String(config.path);
      const [inspection] = await bridge.inspectPaths([path]);
      if (!inspection?.exists || inspection.kind !== kind) throw new Error(`${kind === "file" ? "文件" : "文件夹"}不存在：${path}`);
      return [{ id: `${context.node.id}:open`, nodeId: context.node.id, kind: "open-path", title: context.node.title, target: path }];
    },
    execute: async (config) => {
      await (kind === "file" ? bridge.openFile(String(config.path)) : bridge.openFolder(String(config.path)));
      return { status: "completed" };
    },
  });

  const openUrl: WorkflowNodeDefinition = {
    type: "system.open-url", version: 1, category: "system", title: "打开网址",
    capabilities: ["system.open"], ports, idempotent: true,
    configSchema: { fields: [{ key: "url", label: "网址", type: "text", required: true }] },
    validate: (config, context) => {
      const issues = stringIssues(config, context.node.id, ["url"]);
      if (issues.length === 0 && !/^https?:\/\//i.test(String(config.url))) {
        issues.push({ code: "system.invalid-url", message: "网址必须使用 http:// 或 https://", severity: "error", nodeId: context.node.id, field: "url" });
      }
      return issues;
    },
    preview: async (config, context) => [{ id: `${context.node.id}:url`, nodeId: context.node.id, kind: "open-url", title: context.node.title, target: String(config.url) }],
    execute: async (config) => { await bridge.openUrl(String(config.url)); return { status: "completed" }; },
  };

  const launchApp: WorkflowNodeDefinition = {
    type: "system.launch-app", version: 1, category: "system", title: "启动应用",
    capabilities: ["process.launch"], ports, idempotent: false,
    configSchema: { fields: [
      { key: "executable", label: "可执行程序", type: "file", required: true },
      { key: "arguments", label: "参数", type: "string-list" },
      { key: "workingDirectory", label: "工作目录", type: "folder" },
    ] },
    validate: (config, context) => stringIssues(config, context.node.id, ["executable"]),
    preview: async (config, context) => [{ id: `${context.node.id}:launch`, nodeId: context.node.id, kind: "launch-process", title: context.node.title, target: String(config.executable), metadata: { arguments: processInput(config).arguments } }],
    execute: async (config) => { await bridge.launchProcess(processInput(config)); return { status: "completed" }; },
  };

  const executeProcess: WorkflowNodeDefinition = {
    ...launchApp,
    type: "system.execute-process",
    title: "执行受控命令",
    capabilities: ["process.execute"],
    validate: (config, context) => [
      ...stringIssues(config, context.node.id, ["executable"]),
      ...(!options.allowCommandExecution
        ? [{ code: "system.command-disabled", message: "命令节点尚未在 Workflow 设置中启用", severity: "error" as const, nodeId: context.node.id }]
        : []),
    ],
    preview: async (config, context) => [{ id: `${context.node.id}:execute`, nodeId: context.node.id, kind: "execute-process", title: context.node.title, target: String(config.executable), destructive: true, metadata: { arguments: processInput(config).arguments, workingDirectory: processInput(config).workingDirectory } }],
    execute: async (config) => {
      if (!options.allowCommandExecution) return { status: "failed", message: "命令节点未启用", retryable: false };
      const result = await bridge.executeProcess(processInput(config));
      return {
        status: result.exitCode === 0 ? "completed" : "failed",
        retryable: result.exitCode !== 0,
        output: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
      };
    },
  };

  return [openPath("file"), openPath("folder"), openUrl, launchApp, executeProcess];
}
