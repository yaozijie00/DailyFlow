import { EXTENSION_API_VERSION, type CoreContext } from "../../types";
import { registerWorkflowRunCompletedProvider, unregisterWorkflowRunCompletedProvider } from "../../registry";
import WorkflowPage from "./Page";
import { setTaskCompleter } from "./runnerHost";
import { WorkflowRepository } from "./repository/workflowRepository";

/**
 * DailyFlow 第二个 Extension：Workflow。
 * 产品定位：定义「一件事应该如何完成」——不是 Todo。
 * 关系：Task = 做什么；Workflow = 怎么做；WorkflowRun = 这一次实际怎么做。
 *
 * 数据：Core 库新增扩展专属 4 表（迁移 0021），Repository 属本扩展（经注入 Db 访问）。
 */
export const manifest = {
  id: "com.dailyflow.workflow",
  name: "Workflow",
  description: "把一件事情的完成方法固化成可复用、可执行的工作流（Workflow / Run）",
  version: "0.1.0",
  apiVersion: EXTENSION_API_VERSION,
  author: "DailyFlow",
};

let repoPromise: Promise<WorkflowRepository> | null = null;
function lazyRepo(): Promise<WorkflowRepository> {
  if (!repoPromise) {
    repoPromise = import("../../../db/db").then((m) => new WorkflowRepository(m.getDb()));
  }
  return repoPromise;
}

export function activate(ctx: CoreContext) {
  // P8：Finish→Task 联动——用户确认后经 ctx.tasks.complete 完成任务
  setTaskCompleter(async (taskId) => {
    const ok = await ctx.tasks.complete(taskId);
    if (!ok) {
      throw new Error(`任务完成失败（taskId=${taskId}）：任务不存在或已删除`);
    }
  });
  // A5：WorkflowRun 完成成就数据源（Core 成就引擎统一评估；经 Host Provider 通道）
  registerWorkflowRunCompletedProvider(manifest.id, async () => {
    const repo = await lazyRepo();
    return repo.countCompletedRuns();
  });
  return {
    nav: { page: "ext:workflow", label: "Workflow" },
    Page: WorkflowPage,
  };
}

/** 停用钩子（禁用 Workflow 时反注册成就数据源与任务完成器；不删数据）。 */
export function deactivate(_ctx: CoreContext): void {
  unregisterWorkflowRunCompletedProvider(manifest.id);
  setTaskCompleter(null);
}
