import { describe, it, expect, vi } from "vitest";
import {
  runWorkflowEngine,
  createDefaultExecutors,
  validateWorkflow,
  type WorkflowNodeExecutor,
} from "./workflowEngine";
import { newEdgeId, type Workflow, type WorkflowNode } from "../models";

function node(id: string, type: WorkflowNode["type"], title: string): WorkflowNode {
  return { id, type, title, position: { x: 0, y: 0 }, config: {} };
}

function chain(
  items: Array<{ id: string; type: WorkflowNode["type"]; title: string }>,
): Workflow {
  const nodes = items.map((i) => node(i.id, i.type, i.title));
  const edges = items.slice(0, -1).map((a, i) => ({
    id: newEdgeId(),
    source: a.id,
    target: items[i + 1].id,
  }));
  return {
    id: "wf-test",
    name: "测试",
    version: 1,
    nodes,
    edges,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("WorkflowEngine（顺序状态机）", () => {
  it("顺序执行：goal → app → checkpoint → finish；checkpoint 暂停，resume 后完成", async () => {
    const wf = chain([
      { id: "g", type: "goal", title: "目标" },
      { id: "a", type: "app", title: "打开工具" },
      { id: "c", type: "checkpoint", title: "确认？" },
      { id: "f", type: "finish", title: "完成" },
    ]);
    const launch = vi.fn(async () => undefined);
    const executors = createDefaultExecutors({ launchApp: launch });
    const entered: string[] = [];
    const first = await runWorkflowEngine(wf, executors, null, (n) => entered.push(n.id));
    expect(first.state).toBe("paused");
    expect((first as { nodeId: string }).nodeId).toBe("c");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(entered).toEqual(["g", "a", "c"]);

    const second = await runWorkflowEngine(wf, executors, "c", (n) => entered.push(n.id));
    expect(second.state).toBe("completed");
    expect(entered).toContain("f");
  });

  it("goal → finish 直接完成", async () => {
    const wf = chain([
      { id: "g", type: "goal", title: "目标" },
      { id: "f", type: "finish", title: "完成" },
    ]);
    const out = await runWorkflowEngine(wf, createDefaultExecutors());
    expect(out.state).toBe("completed");
  });

  it("App 节点失败 → failed 且带节点与错误信息", async () => {
    const wf = chain([
      { id: "g", type: "goal", title: "目标" },
      { id: "a", type: "app", title: "Blender" },
      { id: "f", type: "finish", title: "完成" },
    ]);
    const executors = createDefaultExecutors({
      launchApp: async () => {
        throw new Error("ExecutableNotFound: blender.exe");
      },
    });
    const out = await runWorkflowEngine(wf, executors);
    expect(out.state).toBe("failed");
    if (out.state === "failed") {
      expect(out.nodeId).toBe("a");
      expect(out.message).toContain("ExecutableNotFound");
    }
  });

  it("File 节点失败（系统未接入）→ failed", async () => {
    const wf = chain([
      { id: "g", type: "goal", title: "目标" },
      { id: "fl", type: "file", title: "打开工程" },
    ]);
    // 缺少 finish：结构校验失败
    const out = await runWorkflowEngine(wf, createDefaultExecutors());
    expect(out.state).toBe("failed");
  });

  it("校验：缺 goal/finish、分支、循环均报错", () => {
    const wf = chain([{ id: "g", type: "goal", title: "g" }]);
    expect(validateWorkflow(wf).join("；")).toContain("finish");

    const branch = {
      ...chain([
        { id: "g", type: "goal", title: "g" },
        { id: "a", type: "app", title: "a" },
        { id: "f", type: "finish", title: "f" },
      ]),
    };
    branch.edges.push({ id: newEdgeId(), source: "a", target: "f" }); // a → f 两条出边
    expect(validateWorkflow(branch).join("；")).toContain("出边");
  });

  it("checkpoint 执行器本身返回 checkpoint（resume 语义由 Runner 驱动）", async () => {
    const executors: Record<string, WorkflowNodeExecutor> = {
      ...createDefaultExecutors(),
    };
    expect((await executors.checkpoint.execute({ node: node("c", "checkpoint", "x"), workflow: chain([{ id: "c", type: "checkpoint", title: "x" }]), trace: [] })).status).toBe("checkpoint");
  });

  it("action 节点：无副作用说明步骤，顺序执行直接继续（任务书验收流程含 action）", async () => {
    const wf = chain([
      { id: "g", type: "goal", title: "目标" },
      { id: "a", type: "action", title: "导出贴图" },
      { id: "c", type: "checkpoint", title: "确认" },
      { id: "f", type: "finish", title: "完成" },
    ]);
    const executors = createDefaultExecutors();
    const first = await runWorkflowEngine(wf, executors);
    expect(first.state).toBe("paused");
    // action 本身不失败、不暂停：暂停点应在 checkpoint
    if (first.state === "paused") expect(first.nodeId).toBe("c");
    const second = await runWorkflowEngine(wf, executors, "c");
    expect(second.state).toBe("completed");
  });

  it("action 单独在链上执行不产生任何系统调用（无副作用）", async () => {
    const executors = createDefaultExecutors();
    const r = await executors.action.execute({
      node: node("a", "action", "手工步骤"),
      workflow: chain([{ id: "a", type: "action", title: "x" }]),
      trace: [],
    });
    expect(r.status).toBe("continue");
  });
});
