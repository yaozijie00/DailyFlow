// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkflowPlan, WorkflowRunV2 } from "../../domain/types";
import type { WorkflowRunDetailV2 } from "../../services/workflowRunnerV2";
import type { WorkflowTemplate } from "../../templates/templateService";
import { WorkflowRunDialog } from "./WorkflowRunDialog";

const template: WorkflowTemplate = {
  id: "builtin.test",
  schemaVersion: 2,
  name: "创建项目目录",
  description: "测试模板",
  version: 1,
  variables: [
    { key: "root", label: "项目目录", type: "folder", required: true },
    { key: "name", label: "项目名称", type: "text", required: true },
  ],
  nodes: [],
  edges: [],
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  source: "builtin",
  readOnly: true,
  favorite: false,
};

const basePlan: WorkflowPlan = {
  workflowId: template.id,
  workflowVersion: 1,
  variables: { root: "E:\\Work", name: "DailyFlow" },
  requiredCapabilities: ["files.write"],
  effects: [{
    id: "effect",
    nodeId: "tree",
    kind: "create-directory",
    title: "创建源代码目录",
    target: "E:\\Work\\DailyFlow\\src",
    conflict: "fail",
  }],
  issues: [],
  executable: true,
};

function run(state: WorkflowRunV2["state"], output?: Record<string, unknown>): WorkflowRunDetailV2 {
  return {
    run: {
      id: "run-1",
      workflowId: template.id,
      taskId: null,
      state,
      currentNodeId: null,
      startedAt: 10,
      completedAt: state === "completed" || state === "failed" ? 20 : null,
      error: state === "failed" ? { nodeId: "tree", message: "磁盘不可写" } : null,
      workflowVersion: 1,
      workflowSnapshot: template,
      variablesSnapshot: basePlan.variables,
      createdAt: 1,
    },
    steps: [{
      id: "step-1",
      runId: "run-1",
      nodeId: "tree",
      nodeType: "files.create-directory-tree",
      sequence: 0,
      state: state === "failed" ? "failed" : "completed",
      startedAt: 10,
      completedAt: 20,
      output: output ?? null,
      error: state === "failed" ? { message: "磁盘不可写", retryable: true } : null,
      createdAt: 1,
    }],
    events: [],
  };
}

function runner(plan: WorkflowPlan = basePlan, result: WorkflowRunDetailV2 = run("completed")) {
  return {
    plan: vi.fn(async () => plan),
    start: vi.fn(async () => result),
    resume: vi.fn(async () => result),
    retry: vi.fn(async () => result),
    confirmFinish: vi.fn(async () => result),
  };
}

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText("选择或输入文件夹的绝对路径"), { target: { value: "E:\\Work" } });
  fireEvent.change(document.getElementById("workflow-variable-name")!, { target: { value: "DailyFlow" } });
}

afterEach(cleanup);

describe("WorkflowRunDialog", () => {
  it("shows variable errors beside fields and only previews valid input", async () => {
    const api = runner();
    render(<WorkflowRunDialog template={template} runner={api} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    expect(await screen.findByText("项目目录为必填项")).toBeTruthy();
    expect(screen.getByText("项目名称为必填项")).toBeTruthy();
    expect(api.plan).not.toHaveBeenCalled();

    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    await screen.findByText("创建源代码目录");
    expect(screen.getByText("冲突策略：存在时停止")).toBeTruthy();
    expect(api.plan).toHaveBeenCalledWith(template.id, { root: "E:\\Work", name: "DailyFlow" });
  });

  it("blocks execution when a required capability is unavailable", async () => {
    const api = runner();
    render(<WorkflowRunDialog template={template} runner={api} availableCapabilities={[]} onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "缺少能力：files.write");
    expect((screen.getByRole("button", { name: "确认并运行" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires a second confirmation for command effects", async () => {
    const commandPlan: WorkflowPlan = {
      ...basePlan,
      requiredCapabilities: ["process.execute"],
      effects: [{ id: "cmd", nodeId: "cmd", kind: "execute-process", title: "执行构建", target: "npm" }],
    };
    const api = runner(commandPlan);
    render(<WorkflowRunDialog template={template} runner={api} onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    await screen.findByText("执行构建");
    const start = screen.getByRole("button", { name: "确认并运行" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(start.disabled).toBe(false);
  });

  it("keeps entered parameters after failure so the user can revise them", async () => {
    const api = runner(basePlan, run("failed"));
    render(<WorkflowRunDialog template={template} runner={api} onClose={vi.fn()} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    await screen.findByText("创建源代码目录");
    fireEvent.click(screen.getByRole("button", { name: "确认并运行" }));
    await screen.findByText("磁盘不可写");
    fireEvent.click(screen.getByRole("button", { name: "修改参数" }));
    expect((document.getElementById("workflow-variable-name") as HTMLInputElement).value).toBe("DailyFlow");
  });

  it("opens the affected target after a completed run", async () => {
    const api = runner(basePlan, run("completed", { affectedPaths: ["E:\\Work\\DailyFlow"] }));
    const onOpenTarget = vi.fn(async () => undefined);
    render(<WorkflowRunDialog template={template} runner={api} onClose={vi.fn()} onOpenTarget={onOpenTarget} />);
    fillRequired();
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    await screen.findByText("创建源代码目录");
    fireEvent.click(screen.getByRole("button", { name: "确认并运行" }));
    await screen.findByText("Workflow 已完成");
    fireEvent.click(screen.getByRole("button", { name: "打开目标目录" }));
    await waitFor(() => expect(onOpenTarget).toHaveBeenCalledWith("E:\\Work\\DailyFlow"));
  });
});
