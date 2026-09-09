import { describe, expect, it, vi } from "vitest";
import type { WorkflowNodeDefinition } from "./nodeDefinition";
import { WorkflowNodeRegistry } from "./nodeRegistry";
import { planWorkflow } from "./planner";
import type { WorkflowV2 } from "./types";

function definition(type: string, capability?: "files.write"): WorkflowNodeDefinition {
  return {
    type,
    version: 1,
    category: "test",
    title: type,
    capabilities: capability ? [capability] : [],
    ports: [],
    configSchema: { fields: [] },
    validate: vi.fn(() => []),
    preview: vi.fn(async (_config, context) => [
      {
        id: `${context.node.id}:effect`,
        nodeId: context.node.id,
        kind: "create-directory" as const,
        title: context.node.title,
        target: String(context.resolvedConfig.path ?? ""),
      },
    ]),
    execute: vi.fn(async () => ({ status: "completed" as const })),
  };
}

function workflow(): WorkflowV2 {
  return {
    id: "wf",
    schemaVersion: 2,
    name: "项目初始化",
    version: 1,
    variables: [
      { key: "root", label: "根目录", type: "folder", required: true },
      { key: "name", label: "名称", type: "text", required: true },
    ],
    nodes: [
      { id: "a", type: "core.start", typeVersion: 1, title: "开始", position: { x: 0, y: 0 }, config: {} },
      {
        id: "b",
        type: "files.create-directory",
        typeVersion: 1,
        title: "创建目录",
        position: { x: 100, y: 0 },
        config: { path: "{{root}}\\{{name}}" },
      },
      { id: "c", type: "core.finish", typeVersion: 1, title: "完成", position: { x: 200, y: 0 }, config: {} },
    ],
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("planWorkflow", () => {
  it("validates and previews nodes in execution order without executing them", async () => {
    const registry = new WorkflowNodeRegistry();
    const definitions = [
      definition("core.start"),
      definition("files.create-directory", "files.write"),
      definition("core.finish"),
    ];
    definitions.forEach((item) => registry.register(item));

    const plan = await planWorkflow(workflow(), { root: "D:/Projects", name: "DailyFlow" }, registry);

    expect(plan.executable).toBe(true);
    expect(plan.issues).toEqual([]);
    expect(plan.requiredCapabilities).toEqual(["files.write"]);
    expect(plan.effects.map((effect) => effect.nodeId)).toEqual(["a", "b", "c"]);
    expect(plan.effects[1].target).toBe("D:\\Projects\\DailyFlow");
    expect(definitions.every((item) => vi.mocked(item.execute).mock.calls.length === 0)).toBe(true);
  });

  it("returns blocking issues without previewing when variables are invalid", async () => {
    const registry = new WorkflowNodeRegistry();
    const fileNode = definition("files.create-directory", "files.write");
    registry.register(definition("core.start"));
    registry.register(fileNode);
    registry.register(definition("core.finish"));

    const plan = await planWorkflow(workflow(), { root: "relative", name: "" }, registry);

    expect(plan.executable).toBe(false);
    expect(plan.issues.length).toBeGreaterThan(0);
    expect(fileNode.preview).not.toHaveBeenCalled();
  });

  it("reports unknown nodes and invalid graph structure", async () => {
    const registry = new WorkflowNodeRegistry();
    registry.register(definition("core.start"));
    registry.register(definition("core.finish"));
    const source = workflow();
    source.edges.push({ id: "branch", source: "a", target: "c" });

    const plan = await planWorkflow(source, { root: "D:/Projects", name: "DailyFlow" }, registry);

    expect(plan.executable).toBe(false);
    expect(plan.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["graph.multiple-outgoing", "node.unregistered"]),
    );
  });
});
