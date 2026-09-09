import type { WorkflowNodeRegistry } from "./nodeRegistry";
import type {
  ValidationIssue,
  WorkflowNodeV2,
  WorkflowPlan,
  WorkflowV2,
  WorkflowVariableValues,
} from "./types";
import {
  resolveConfigTemplates,
  validateVariableDefinitions,
  validateVariableValues,
} from "./variables";

function graphIssue(code: string, message: string, nodeId?: string): ValidationIssue {
  return { code, message, severity: "error", ...(nodeId ? { nodeId } : {}) };
}

function validateAndOrderGraph(workflow: WorkflowV2): {
  order: WorkflowNodeV2[];
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const starts = workflow.nodes.filter((node) => node.type === "core.start");
  const finishes = workflow.nodes.filter((node) => node.type === "core.finish");
  if (starts.length !== 1) {
    issues.push(graphIssue("graph.start-count", "Workflow 必须且只能包含一个开始节点"));
  }
  if (finishes.length !== 1) {
    issues.push(graphIssue("graph.finish-count", "Workflow 必须且只能包含一个完成节点"));
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      issues.push(graphIssue("graph.dangling-edge", `连线引用了不存在的节点：${edge.source} → ${edge.target}`));
      continue;
    }
    if (edge.source === edge.target) {
      issues.push(graphIssue("graph.self-edge", `节点不能连接自身：${edge.source}`, edge.source));
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }
  for (const node of workflow.nodes) {
    if ((outgoing.get(node.id)?.length ?? 0) > 1) {
      issues.push(graphIssue("graph.multiple-outgoing", `节点「${node.title}」存在多条出边`, node.id));
    }
    if ((incoming.get(node.id)?.length ?? 0) > 1) {
      issues.push(graphIssue("graph.multiple-incoming", `节点「${node.title}」存在多条入边`, node.id));
    }
  }

  const order: WorkflowNodeV2[] = [];
  const seen = new Set<string>();
  let current: WorkflowNodeV2 | undefined = starts[0];
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    order.push(current);
    const nextId: string | undefined = outgoing.get(current.id)?.[0];
    current = nextId ? byId.get(nextId) : undefined;
  }
  if (current) issues.push(graphIssue("graph.cycle", "Workflow 中检测到循环", current.id));
  if (starts.length === 1 && !order.some((node) => node.type === "core.finish")) {
    issues.push(graphIssue("graph.finish-unreachable", "完成节点无法从开始节点到达"));
  }
  if (seen.size !== workflow.nodes.length) {
    issues.push(graphIssue("graph.unreachable", "Workflow 包含无法从开始节点到达的节点"));
  }
  return { order, issues };
}

export async function planWorkflow(
  workflow: WorkflowV2,
  inputValues: WorkflowVariableValues,
  registry: WorkflowNodeRegistry,
): Promise<WorkflowPlan> {
  const definitionIssues = validateVariableDefinitions(workflow.variables);
  const valueResult = validateVariableValues(workflow.variables, inputValues);
  const graph = validateAndOrderGraph(workflow);
  const issues: ValidationIssue[] = [...definitionIssues, ...valueResult.issues, ...graph.issues];
  const resolvedByNode = new Map<string, Record<string, unknown>>();
  const capabilities = new Set<WorkflowPlan["requiredCapabilities"][number]>();

  for (const node of workflow.nodes) {
    const definition = registry.get(node.type);
    if (!definition) {
      issues.push(graphIssue("node.unregistered", `未注册的 Workflow 节点：${node.type}`, node.id));
      continue;
    }
    if (node.typeVersion > definition.version) {
      issues.push(
        graphIssue(
          "node.unsupported-version",
          `节点「${node.title}」需要版本 ${node.typeVersion}，当前仅支持 ${definition.version}`,
          node.id,
        ),
      );
    }
    definition.capabilities.forEach((capability) => capabilities.add(capability));
    const resolved = resolveConfigTemplates(node.config, valueResult.values, workflow.variables);
    if (!resolved.ok) {
      issues.push(...resolved.issues.map((item) => ({ ...item, nodeId: node.id })));
      continue;
    }
    resolvedByNode.set(node.id, resolved.value);
    issues.push(
      ...definition.validate(resolved.value, {
        workflow,
        node,
        variables: valueResult.values,
        resolvedConfig: resolved.value,
      }),
    );
  }

  if (issues.some((item) => item.severity === "error")) {
    return {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      variables: valueResult.values,
      requiredCapabilities: [...capabilities],
      effects: [],
      issues,
      executable: false,
    };
  }

  const effects: WorkflowPlan["effects"] = [];
  for (const node of graph.order) {
    const definition = registry.require(node.type);
    const resolvedConfig = resolvedByNode.get(node.id) ?? {};
    try {
      effects.push(
        ...(await definition.preview(resolvedConfig, {
          workflow,
          node,
          variables: valueResult.values,
          resolvedConfig,
        })),
      );
    } catch (error) {
      issues.push(
        graphIssue(
          "node.preview-failed",
          error instanceof Error ? error.message : String(error),
          node.id,
        ),
      );
      break;
    }
  }

  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    variables: valueResult.values,
    requiredCapabilities: [...capabilities],
    effects,
    issues,
    executable: !issues.some((item) => item.severity === "error"),
  };
}
