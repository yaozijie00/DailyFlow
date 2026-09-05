import { invoke } from "@tauri-apps/api/core";
import type { WorkflowNode } from "./models";

/**
 * Workflow 前端系统操作（P7）：把节点 config 翻译成 Tauri 命令参数。
 * - app 节点：config.executablePath（必填）、config.arguments（可选）、config.workingDirectory（可选）；
 * - file/folder 节点：config.path（必填，绝对路径）；
 * 错误以中文可读信息抛出，由 Engine 捕获记入 Run.error。
 * 注：自定义命令无需在 capabilities 中声明（ACL 只约束插件/核心命令，现有命令同此）。
 */

function needString(node: WorkflowNode, key: string): string {
  const v = node.config[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`${node.title}（${node.type}）缺少配置：${key}`);
  }
  return v.trim();
}

export const workflowSystemOps = {
  async launchApp(node: WorkflowNode): Promise<void> {
    const executable = needString(node, "executablePath");
    const arguments_ = typeof node.config.arguments === "string" ? node.config.arguments : undefined;
    const workingDirectory =
      typeof node.config.workingDirectory === "string" ? node.config.workingDirectory : undefined;
    await invoke("workflow_launch_process", {
      executable,
      arguments: arguments_,
      workingDirectory,
    });
  },

  async openFile(node: WorkflowNode): Promise<void> {
    const path = needString(node, "path");
    await invoke("workflow_open_file", { path });
  },

  async openFolder(node: WorkflowNode): Promise<void> {
    const path = needString(node, "path");
    await invoke("workflow_open_folder", { path });
  },

  /** 预检：给定绝对路径是否存在（编辑校验用，不启动任何东西）。 */
  async pathExists(path: string): Promise<boolean> {
    if (typeof path !== "string" || path.trim() === "") return false;
    return invoke<boolean>("workflow_path_exists", { path });
  },
};

/** RunnerSystemOps 形态（供 createWorkflowRunner 注入）。 */
export const runnerSystemOps = {
  launchApp: workflowSystemOps.launchApp,
  openFile: workflowSystemOps.openFile,
  openFolder: workflowSystemOps.openFolder,
};
