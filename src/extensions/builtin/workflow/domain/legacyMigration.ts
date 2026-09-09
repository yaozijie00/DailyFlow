import type { Workflow, WorkflowNodeType } from "../models";
import type { ValidationIssue, WorkflowV2 } from "./types";

const LEGACY_TYPE_MAP: Record<WorkflowNodeType, string> = {
  goal: "core.start",
  action: "core.manual-step",
  checkpoint: "core.checkpoint",
  finish: "core.finish",
  app: "system.launch-app",
  file: "system.open-file",
  folder: "system.open-folder",
};

export interface LegacyMigrationResult {
  workflow: WorkflowV2 | null;
  issues: ValidationIssue[];
}

export function migrateLegacyWorkflow(source: Workflow): LegacyMigrationResult {
  const issues: ValidationIssue[] = [];
  const nodes = source.nodes.map((node) => {
    const mappedType = LEGACY_TYPE_MAP[node.type];
    if (!mappedType) {
      issues.push({
        code: "legacy.unknown-node-type",
        message: `无法迁移旧节点类型：${String(node.type)}`,
        severity: "error",
        nodeId: node.id,
      });
      return null;
    }
    return {
      id: node.id,
      type: mappedType,
      typeVersion: 1,
      title: node.title,
      description: node.description,
      position: { ...node.position },
      config: structuredClone(node.config),
    };
  });

  if (issues.length > 0) return { workflow: null, issues };

  return {
    workflow: {
      id: source.id,
      schemaVersion: 2,
      name: source.name,
      description: source.description,
      version: source.version,
      variables: [],
      nodes: nodes.filter((node): node is NonNullable<typeof node> => node !== null),
      edges: source.edges.map((edge) => ({ ...edge })),
      tags: [...source.tags],
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    },
    issues,
  };
}
