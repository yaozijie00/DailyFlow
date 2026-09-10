// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkflowTemplate } from "../templates/templateService";
import { WorkflowQuickLaunch, WorkflowTaskAction } from "./WorkflowQuickLaunch";

const template: WorkflowTemplate = {
  id: "builtin.general-project",
  schemaVersion: 2,
  name: "创建通用项目目录",
  description: "快速建立项目结构",
  version: 1,
  variables: [],
  nodes: [],
  edges: [],
  tags: ["项目"],
  createdAt: 1,
  updatedAt: 1,
  source: "builtin",
  readOnly: true,
  favorite: true,
};

afterEach(cleanup);

describe("WorkflowQuickLaunch", () => {
  it("shows pinned templates and opens the preview-first runner", async () => {
    const dataSource = { listTemplates: vi.fn(async () => [template]) };
    render(<WorkflowQuickLaunch dataSource={dataSource} />);
    fireEvent.click(await screen.findByRole("button", { name: /创建通用项目目录/ }));
    expect(screen.getByRole("dialog", { name: "创建通用项目目录" })).toBeTruthy();
  });

  it("hides itself when template loading fails", async () => {
    const dataSource = { listTemplates: vi.fn(async () => { throw new Error("offline"); }) };
    const { container } = render(<WorkflowQuickLaunch dataSource={dataSource} />);
    await waitFor(() => expect(dataSource.listTemplates).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("launches a selected workflow with only the minimal task context", async () => {
    const dataSource = { listTemplates: vi.fn(async () => [template]) };
    const runner = {
      plan: vi.fn(async () => ({ workflowId: template.id, workflowVersion: 1, variables: {}, requiredCapabilities: [], effects: [], issues: [], executable: true })),
      start: vi.fn(async () => ({ run: { id: "run-1", state: "completed" }, steps: [], events: [] })),
      resume: vi.fn(),
      retry: vi.fn(),
      confirmFinish: vi.fn(),
    };
    render(<WorkflowTaskAction task={{ id: 42, title: "整理素材", status: "TODO" }} dataSource={dataSource} runner={runner as never} />);
    fireEvent.click(screen.getByRole("button", { name: "运行 Workflow" }));
    fireEvent.click(await screen.findByRole("button", { name: /创建通用项目目录/ }));
    fireEvent.click(screen.getByRole("button", { name: "预览操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认并运行" }));
    await waitFor(() => expect(runner.start).toHaveBeenCalledWith({ workflowId: template.id, variables: {}, taskId: 42 }));
  });
});

