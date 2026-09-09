import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { workflowSystemBridge } from "./systemBridge";

describe("workflowSystemBridge", () => {
  beforeEach(() => invoke.mockReset());

  it("passes structured directory and file arguments", async () => {
    invoke.mockResolvedValueOnce([{ path: "D:\\Projects", exists: false, kind: "missing" }]);
    await workflowSystemBridge.inspectPaths(["D:\\Projects"]);
    expect(invoke).toHaveBeenLastCalledWith("workflow_inspect_paths", {
      paths: ["D:\\Projects"],
    });

    invoke.mockResolvedValueOnce(["D:\\Projects", "D:\\Projects\\src"]);
    await workflowSystemBridge.createDirectories(["D:\\Projects", "D:\\Projects\\src"]);
    expect(invoke).toHaveBeenLastCalledWith("workflow_create_directories", {
      paths: ["D:\\Projects", "D:\\Projects\\src"],
    });

    invoke.mockResolvedValueOnce({ outcome: "created", actualPath: "D:\\Projects\\README.md" });
    await workflowSystemBridge.writeTextFile({
      path: "D:\\Projects\\README.md",
      content: "# Project",
      conflict: "fail",
    });
    expect(invoke).toHaveBeenLastCalledWith("workflow_write_text_file", {
      input: {
        path: "D:\\Projects\\README.md",
        content: "# Project",
        conflict: "fail",
      },
    });
  });

  it("passes process arguments as an array instead of a shell string", async () => {
    invoke.mockResolvedValueOnce({ exitCode: 0, stdout: "ok", stderr: "" });
    await workflowSystemBridge.executeProcess({
      executable: "C:\\Tools\\generator.exe",
      arguments: ["--name", "My Project"],
      workingDirectory: "D:\\Projects",
    });

    expect(invoke).toHaveBeenCalledWith("workflow_execute_process", {
      input: {
        executable: "C:\\Tools\\generator.exe",
        arguments: ["--name", "My Project"],
        workingDirectory: "D:\\Projects",
      },
    });
  });
});
