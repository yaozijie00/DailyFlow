// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkflowRunDetail } from "../../services/workflowService";
import { RunCenter } from "./RunCenter";

function detail(state: WorkflowRunDetail["run"]["state"] = "failed"): WorkflowRunDetail {
  return {
    workflowName: "已删除的项目模板",
    templateDeleted: true,
    run: {
      id: "run-1",
      workflowId: "workflow-1",
      taskId: null,
      state,
      currentNodeId: "node-1",
      startedAt: 2,
      completedAt: state === "completed" ? 3 : null,
      error: state === "failed" ? { nodeId: "node-1", message: "目录被占用" } : null,
      workflowVersion: 3,
      workflowSnapshot: {
        id: "workflow-1",
        schemaVersion: 2,
        name: "已删除的项目模板",
        version: 3,
        variables: [],
        nodes: [{ id: "node-1", type: "files.create-directory", typeVersion: 1, title: "创建项目目录", position: { x: 0, y: 0 }, config: {} }],
        edges: [],
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
      variablesSnapshot: {},
      createdAt: 1,
    },
    steps: [{ id: "step-1", runId: "run-1", nodeId: "node-1", nodeType: "files.create-directory", sequence: 0, state: state === "failed" ? "failed" : "completed", startedAt: 2, completedAt: 3, output: { affectedPaths: ["E:\\Projects\\Stone"] }, error: state === "failed" ? { message: "目录被占用", retryable: true } : null, createdAt: 1 }],
  };
}

afterEach(cleanup);

describe("RunCenter", () => {
  it("filters all run states and renders the snapshot timeline after a template is deleted", async () => {
    const dataSource = { listRunDetails: vi.fn(async () => ({ items: [detail()], nextCursor: null })) };
    const runner = { retry: vi.fn(), resume: vi.fn(), confirmFinish: vi.fn(), cancel: vi.fn() };
    render(<RunCenter dataSource={dataSource} runner={runner as never} />);

    expect(await screen.findAllByText("已删除的项目模板")).toHaveLength(2);
    expect(screen.getAllByText(/模板已删除|原模板已删除/)).toHaveLength(2);
    expect(screen.getByText("创建项目目录")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "运行中" }));
    await waitFor(() => expect(dataSource.listRunDetails).toHaveBeenLastCalledWith({ states: ["pending", "running", "paused"], limit: 30 }));
    fireEvent.click(screen.getByRole("tab", { name: "等待确认" }));
    await waitFor(() => expect(dataSource.listRunDetails).toHaveBeenLastCalledWith({ states: ["awaiting-confirm"], limit: 30 }));
    fireEvent.click(screen.getByRole("tab", { name: "失败" }));
    await waitFor(() => expect(dataSource.listRunDetails).toHaveBeenLastCalledWith({ states: ["failed"], limit: 30 }));
    fireEvent.click(screen.getByRole("tab", { name: "完成" }));
    await waitFor(() => expect(dataSource.listRunDetails).toHaveBeenLastCalledWith({ states: ["completed"], limit: 30 }));
  });

  it("safely retries a retryable step and opens an actual result path", async () => {
    const initial = detail();
    const completed = detail("completed");
    const dataSource = { listRunDetails: vi.fn(async () => ({ items: [initial], nextCursor: null })) };
    const runner = {
      retry: vi.fn(async () => ({ run: completed.run, steps: completed.steps, events: [] })),
      resume: vi.fn(),
      confirmFinish: vi.fn(),
      cancel: vi.fn(),
    };
    const open = vi.fn(async () => undefined);
    render(<RunCenter dataSource={dataSource} runner={runner as never} onOpenTarget={open} />);

    fireEvent.click(await screen.findByRole("button", { name: "安全重试" }));
    await waitFor(() => expect(runner.retry).toHaveBeenCalledWith("run-1"));
    fireEvent.click(screen.getByRole("button", { name: /E:\\Projects\\Stone/ }));
    expect(open).toHaveBeenCalledWith("E:\\Projects\\Stone");
  });

  it("cancels an unfinished run from its detail panel", async () => {
    const paused = detail("paused");
    const cancelled = detail("cancelled");
    const dataSource = { listRunDetails: vi.fn(async () => ({ items: [paused], nextCursor: null })) };
    const runner = {
      retry: vi.fn(),
      resume: vi.fn(),
      confirmFinish: vi.fn(),
      cancel: vi.fn(async () => ({ run: cancelled.run, steps: cancelled.steps, events: [] })),
    };
    render(<RunCenter dataSource={dataSource} runner={runner as never} />);

    fireEvent.click(await screen.findByRole("button", { name: "取消运行" }));
    await waitFor(() => expect(runner.cancel).toHaveBeenCalledWith("run-1"));
    expect(screen.queryByRole("button", { name: "取消运行" })).toBeNull();
  });
});
