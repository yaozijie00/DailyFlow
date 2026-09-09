import { describe, expect, it, vi } from "vitest";
import type { WorkflowNodeDefinition } from "./nodeDefinition";
import { WorkflowNodeRegistry } from "./nodeRegistry";
import type { WorkflowCapability } from "./types";

function fakeDefinition(
  type: string,
  capabilities: WorkflowCapability[] = ["files.read"],
): WorkflowNodeDefinition {
  return {
    type,
    version: 1,
    category: "test",
    title: type,
    capabilities: [...capabilities],
    ports: [
      { id: "in", direction: "input", maxConnections: 1 },
      { id: "out", direction: "output", maxConnections: 1 },
    ],
    configSchema: { fields: [] },
    validate: vi.fn(() => []),
    preview: vi.fn(async () => []),
    execute: vi.fn(async () => ({ status: "completed" as const })),
  };
}

describe("WorkflowNodeRegistry", () => {
  it("registers and resolves a node definition", () => {
    const registry = new WorkflowNodeRegistry();
    const definition = fakeDefinition("core.start");
    registry.register(definition);

    expect(registry.get("core.start")).toMatchObject({ type: "core.start", version: 1 });
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects duplicate node types", () => {
    const registry = new WorkflowNodeRegistry();
    registry.register(fakeDefinition("core.start"));
    expect(() => registry.register(fakeDefinition("core.start"))).toThrow("重复节点类型");
  });

  it("rejects invalid type names and versions", () => {
    const registry = new WorkflowNodeRegistry();
    expect(() => registry.register(fakeDefinition("start"))).toThrow("节点类型");
    expect(() => registry.register({ ...fakeDefinition("core.start"), version: 0 })).toThrow(
      "版本",
    );
  });

  it("deduplicates capabilities without mutating the input", () => {
    const registry = new WorkflowNodeRegistry();
    const definition = fakeDefinition("files.inspect", ["files.read", "files.read"]);
    registry.register(definition);

    expect(registry.require("files.inspect").capabilities).toEqual(["files.read"]);
    expect(definition.capabilities).toEqual(["files.read", "files.read"]);
  });

  it("returns undefined for optional lookup and a readable error for required lookup", () => {
    const registry = new WorkflowNodeRegistry();
    expect(registry.get("missing.node")).toBeUndefined();
    expect(() => registry.require("missing.node")).toThrow("未注册的 Workflow 节点：missing.node");
  });
});
