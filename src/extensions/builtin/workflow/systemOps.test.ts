import { describe, it, expect, vi, beforeEach } from "vitest";

// mock @tauri-apps/api/core 的 invoke：捕获参数（前端契约锁进测试）
const invokeMock = vi.hoisted(
  () =>
    vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(async () => undefined),
);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { workflowSystemOps } from "./systemOps";
import type { WorkflowNode } from "./models";

function node(overrides: Partial<WorkflowNode>): WorkflowNode {
  return { id: "n1", type: "app", title: "工具", position: { x: 0, y: 0 }, config: {}, ...overrides };
}

describe("workflowSystemOps（Tauri invoke 契约，P5）", () => {
  beforeEach(() => invokeMock.mockClear());

  it("launchApp：读取 executablePath/arguments/workingDirectory 并转发", async () => {
    const n = node({
      type: "app",
      config: {
        executablePath: "D:\\Tools\\Blender\\blender.exe",
        arguments: "--background \"D:\\My Folder\\x.blend\"",
        workingDirectory: "D:\\Project",
      },
    });
    await workflowSystemOps.launchApp(n);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("workflow_launch_process", {
      executable: "D:\\Tools\\Blender\\blender.exe",
      arguments: '--background "D:\\My Folder\\x.blend"',
      workingDirectory: "D:\\Project",
    });
  });

  it("launchApp：缺少 executablePath → 中文错误且不 invoke", async () => {
    const n = node({ type: "app", config: {} });
    await expect(workflowSystemOps.launchApp(n)).rejects.toThrow("缺少配置：executablePath");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("openFile / openFolder：读取 config.path 并转发", async () => {
    await workflowSystemOps.openFile(node({ type: "file", config: { path: "C:\\a.sbs" } }));
    expect(invokeMock).toHaveBeenLastCalledWith("workflow_open_file", { path: "C:\\a.sbs" });

    await workflowSystemOps.openFolder(node({ type: "folder", config: { path: "D:\\Folder" } }));
    expect(invokeMock).toHaveBeenLastCalledWith("workflow_open_folder", { path: "D:\\Folder" });
  });

  it("pathExists：空白路径直接返回 false（不 invoke）", async () => {
    expect(await workflowSystemOps.pathExists("  ")).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    invokeMock.mockResolvedValueOnce(true);
    expect(await workflowSystemOps.pathExists("C:\\exists")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("workflow_path_exists", { path: "C:\\exists" });
  });
});
