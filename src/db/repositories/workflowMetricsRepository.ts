import { and, gte, lt } from "drizzle-orm";
import type { Db } from "../db";
import { workflowRuns, workflows } from "../schema";

/**
 * Workflow 执行指标只读仓库（A6 Analytics Layer）。
 * 表（workflows/workflow_runs）位于 Core 库（迁移 0021，基础设施归 Core），
 * 本仓库只读聚合供 Core 统计/分析层使用；写路径仍归 Workflow 扩展 Repository。
 */
export interface WorkflowExecutionAggregate {
  /** [from,to) 内完成的 run 数 */
  completedRuns: number;
  /** [from,to) 内失败 run 数 */
  failedRuns: number;
  /** 平均执行时长（秒；基于 completed 的 run，无则 0） */
  avgRunSeconds: number;
  /** 最常用 Workflow 名（按完成数；无则 null） */
  topWorkflow: string | null;
}

export class WorkflowMetricsRepository {
  constructor(private readonly db: Db) {}

  /** [from, to)（completedAt 落区间）内的执行指标。 */
  async aggregateInRange(from: number, to: number): Promise<WorkflowExecutionAggregate> {
    const rows = await this.db
      .select({
        state: workflowRuns.state,
        completedAt: workflowRuns.completedAt,
        startedAt: workflowRuns.startedAt,
        workflowId: workflowRuns.workflowId,
      })
      .from(workflowRuns)
      .where(
        and(
          gte(workflowRuns.completedAt, from),
          lt(workflowRuns.completedAt, to),
        ),
      )
      .all();

    const completed = rows.filter((r) => r.state === "completed");
    const failed = rows.filter((r) => r.state === "failed");
    const durations = completed
      .map((r) =>
        r.startedAt != null && r.completedAt != null ? r.completedAt - r.startedAt : null,
      )
      .filter((d): d is number => d != null && d > 0);
    const avgRunSeconds =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000)
        : 0;

    // 最常用 workflow（按完成 run 数）
    let topWorkflow: string | null = null;
    let topCount = 0;
    const byWf = new Map<string, number>();
    for (const r of completed) {
      byWf.set(r.workflowId, (byWf.get(r.workflowId) ?? 0) + 1);
    }
    if (byWf.size > 0) {
      const wfRows = await this.db
        .select({ id: workflows.id, name: workflows.name })
        .from(workflows)
        .all();
      const nameById = new Map(wfRows.map((w) => [w.id, w.name]));
      for (const [wfId, n] of byWf) {
        if (n > topCount) {
          topCount = n;
          topWorkflow = nameById.get(wfId) ?? null;
        }
      }
    }

    return { completedRuns: completed.length, failedRuns: failed.length, avgRunSeconds, topWorkflow };
  }
}
