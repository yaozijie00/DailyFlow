import { describe, expect, it } from "vitest";
import type { Workflow } from "../models";
import { migrateLegacyWorkflow } from "./legacyMigration";

const now = Date.now();

function legacyWorkflow(): Workflow {
  const types = ["goal", "action", "checkpoint", "app", "file", "folder", "finish"] as const;
  return {
    id: "wf_legacy",
    name: "旧流程",
    description: "保留内容",
    version: 4,
    tags: ["legacy"],
    nodes: types.map((type, index) => ({
      id: `node_${index}`,
      type,
      title: `节点 ${index}`,
      description: `说明 ${index}`,
      position: { x: index * 100, y: index * 10 },
      config: { path: `C:\\Test\\${index}` },
    })),
    edges: types.slice(1).map((_, index) => ({
      id: `edge_${index}`,
      source: `node_${index}`,
      target: `node_${index + 1}`,
    })),
    createdAt: now - 1000,
    updatedAt: now,
  };
}

describe("migrateLegacyWorkflow", () => {
  it("maps every V1 node type and preserves user data", () => {
    const source = legacyWorkflow();
    const result = migrateLegacyWorkflow(source);

    expect(result.issues).toEqual([]);
    expect(result.workflow?.nodes.map((node) => node.type)).toEqual([
      "core.start",
      "core.manual-step",
      "core.checkpoint",
      "system.launch-app",
      "system.open-file",
      "system.open-folder",
      "core.finish",
    ]);
    expect(result.workflow).toMatchObject({
      id: source.id,
      schemaVersion: 2,
      name: source.name,
      description: source.description,
      version: source.version,
      variables: [],
      tags: source.tags,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });
    expect(result.workflow?.nodes[1]).toMatchObject({
      id: "node_1",
      typeVersion: 1,
      title: "节点 1",
      description: "说明 1",
      position: { x: 100, y: 10 },
      config: { path: "C:\\Test\\1" },
    });
    expect(result.workflow?.edges).toEqual(source.edges);
  });

  it("returns a blocking issue and no workflow for an unknown runtime type", () => {
    const source = legacyWorkflow();
    source.nodes[2] = { ...source.nodes[2], type: "plugin.unknown" as never };

    const result = migrateLegacyWorkflow(source);

    expect(result.workflow).toBeNull();
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "legacy.unknown-node-type",
        severity: "error",
        nodeId: "node_2",
      }),
    ]);
  });

  it("does not mutate the legacy workflow", () => {
    const source = legacyWorkflow();
    const before = structuredClone(source);
    migrateLegacyWorkflow(source);
    expect(source).toEqual(before);
  });
});
