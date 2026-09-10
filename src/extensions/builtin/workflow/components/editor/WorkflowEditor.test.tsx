// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkflowNodeRegistry } from "../../domain/nodeRegistry";
import type { WorkflowNodeDefinition } from "../../domain/nodeDefinition";
import type { WorkflowV2 } from "../../domain/types";
import { CORE_NODE_DEFINITIONS } from "../../nodes/coreNodes";
import {
  commitEditorHistory,
  createEditorHistory,
  isEditorHistoryDirty,
  markEditorHistoryClean,
  redoEditorHistory,
  undoEditorHistory,
} from "./editorHistory";
import { WorkflowEditor } from "./WorkflowEditor";

vi.mock("./WorkflowCanvas", () => ({
  WorkflowCanvas: (props: {
    workflow: WorkflowV2;
    onSelectionChange: (ids: string[]) => void;
    onDropNode: (type: string, position: { x: number; y: number }) => void;
  }) => <div data-testid="canvas" data-nodes={props.workflow.nodes.length} data-edges={props.workflow.edges.length} data-positions={JSON.stringify(props.workflow.nodes.map((node) => node.position))}>
    <button type="button" onClick={() => props.onDropNode("test.action", { x: 320, y: 180 })}>模拟拖入节点</button>
    <button type="button" onClick={() => props.onSelectionChange(["action"])}>选择动作节点</button>
    <button type="button" onClick={() => props.onSelectionChange(["action", "finish"])}>选择多个节点</button>
  </div>,
}));

const execute = vi.fn(async () => ({ status: "completed" as const }));
const actionDefinition: WorkflowNodeDefinition = {
  type: "test.action",
  version: 1,
  category: "test",
  title: "测试动作",
  capabilities: [],
  ports: [{ id: "in", direction: "input" }, { id: "out", direction: "output" }],
  configSchema: { fields: [{ key: "path", label: "目标路径", type: "text", required: true }] },
  idempotent: true,
  validate: (config, context) => typeof config.path === "string" && config.path ? [] : [{ code: "test.path", message: "请填写目标路径", severity: "error", nodeId: context.node.id, field: "path" }],
  preview: async () => [],
  execute,
};

function registry(): WorkflowNodeRegistry {
  const value = new WorkflowNodeRegistry();
  [...CORE_NODE_DEFINITIONS, actionDefinition].forEach((definition) => value.register(definition));
  return value;
}

function workflow(): WorkflowV2 {
  return {
    id: "wf-editor",
    schemaVersion: 2,
    name: "编辑器测试",
    version: 1,
    variables: [],
    nodes: [
      { id: "start", type: "core.start", typeVersion: 1, title: "开始", position: { x: 0, y: 0 }, config: {} },
      { id: "action", type: "test.action", typeVersion: 1, title: "动作", position: { x: 100, y: 50 }, config: {} },
      { id: "finish", type: "core.finish", typeVersion: 1, title: "完成", position: { x: 200, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "start", target: "action" },
      { id: "e2", source: "action", target: "finish" },
    ],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); execute.mockClear(); });

describe("WorkflowEditor", () => {
  it("adds nodes from palette or drop and edits config through the generated inspector", () => {
    render(<WorkflowEditor workflow={workflow()} registry={registry()} onSave={vi.fn()} onBack={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText("请填写目标路径")).toBeTruthy();
    fireEvent.click(screen.getByText("请填写目标路径"));
    fireEvent.change(screen.getByRole("textbox", { name: "目标路径" }), { target: { value: "E:\\Work" } });
    expect(screen.queryByText("请填写目标路径")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "测试动作" }));
    expect(screen.getByTestId("canvas").getAttribute("data-nodes")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "模拟拖入节点" }));
    expect(screen.getByTestId("canvas").getAttribute("data-nodes")).toBe("5");
  });

  it("duplicates nodes, deletes multi-selection with connected edges, and supports undo/redo", () => {
    render(<WorkflowEditor workflow={workflow()} registry={registry()} onSave={vi.fn()} onBack={vi.fn()} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "选择动作节点" }));
    fireEvent.click(screen.getByRole("button", { name: "复制节点" }));
    expect(screen.getByTestId("canvas").getAttribute("data-nodes")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.getByTestId("canvas").getAttribute("data-nodes")).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(screen.getByTestId("canvas").getAttribute("data-nodes")).toBe("4");

    fireEvent.click(screen.getByRole("button", { name: "选择多个节点" }));
    fireEvent.click(screen.getByRole("button", { name: "删除 2 个节点" }));
    expect(screen.getByTestId("canvas").getAttribute("data-edges")).toBe("0");
  });

  it("auto-arranges, warns on unsaved exit, and focuses a node from validation", () => {
    const onBack = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WorkflowEditor workflow={workflow()} registry={registry()} onSave={vi.fn()} onBack={onBack} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByText("请填写目标路径"));
    expect(screen.getByRole("textbox", { name: "节点标题" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "自动排列" }));
    expect(screen.getByTestId("canvas").getAttribute("data-positions")).not.toContain('"x":100,"y":50');
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(confirm).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the draft after save failure and trial run does not execute nodes", async () => {
    const onSave = vi.fn(async () => { throw new Error("数据库写入失败"); });
    const onPreview = vi.fn(async () => undefined);
    render(<WorkflowEditor workflow={workflow()} registry={registry()} onSave={onSave} onBack={vi.fn()} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button", { name: "选择动作节点" }));
    fireEvent.change(screen.getByRole("textbox", { name: "目标路径" }), { target: { value: "E:\\Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect((await screen.findByRole("alert")).textContent).toContain("数据库写入失败");
    expect((screen.getByRole("textbox", { name: "目标路径" }) as HTMLInputElement).value).toBe("E:\\Draft");
    fireEvent.click(screen.getByRole("button", { name: "试运行" }));
    await waitFor(() => expect(onPreview).toHaveBeenCalled());
    expect(execute).not.toHaveBeenCalled();
  });

  it("caps history at 50 entries and marking clean retains undo history", () => {
    let history = createEditorHistory({ value: 0 });
    for (let value = 1; value <= 55; value += 1) history = commitEditorHistory(history, { value });
    expect(history.past).toHaveLength(50);
    history = markEditorHistoryClean(history);
    expect(history.past).toHaveLength(50);
    expect(isEditorHistoryDirty(history)).toBe(false);
    history = undoEditorHistory(history);
    expect(history.present.value).toBe(54);
    history = redoEditorHistory(history);
    expect(history.present.value).toBe(55);
  });
});
