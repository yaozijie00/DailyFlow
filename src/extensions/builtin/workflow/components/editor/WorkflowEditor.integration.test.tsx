// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createBuiltInNodeRegistry } from "../../nodes/builtInRegistry";
import type { WorkflowV2 } from "../../domain/types";
import { WorkflowEditor } from "./WorkflowEditor";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("WorkflowEditor with the real React Flow canvas", () => {
  it("mounts without a repeated controlled-selection update", async () => {
    const workflow: WorkflowV2 = {
      id: "workflow-real-canvas",
      schemaVersion: 2,
      name: "真实画布",
      version: 1,
      variables: [],
      nodes: [{ id: "start", type: "core.start", typeVersion: 1, title: "开始", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    };
    render(<WorkflowEditor workflow={workflow} registry={createBuiltInNodeRegistry()} onSave={vi.fn()} onBack={vi.fn()} onPreview={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "保存" })).toBeTruthy();
    expect(screen.getByText("真实画布")).toBeTruthy();
  });
});

