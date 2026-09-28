import { readFocusSlices } from "../focusAnalytics";
import { and, count, desc, eq, inArray, like, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { snapshotPlanning, restorePlanning, type PlanningSnapshot } from "./planningSnapshot";
import { goals, tasks, longTermPhases, longTermPlanHistory, projects } from "../schema";
import { startOfLocalWeek, type LongTermPriority, type LongTermStatus } from "../../lib/longTermPlan";

export type Goal = typeof goals.$inferSelect;

export type GoalStatus = LongTermStatus;

export type GoalPriority = LongTermPriority | "high" | "medium" | "low";

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  /** 结束日期（YYYY-MM-DD，可空） */
  deadline?: string | null;
  /** 开始日期（YYYY-MM-DD，可空；月视图任务块起点） */
  startDate?: string | null;
  priority?: GoalPriority;
  /** 手动进度 0-100（可空；null=按关联任务自动计算） */
  manualProgress?: number | null;
  status?: GoalStatus;
  weeklyTargetMinutes?: number;
  progressMode?: "estimated" | "tasks" | "manual";
  estimatedCompletionDate?: string | null;
  currentPhaseId?: number | null;
  nextAction?: string | null;
  weeklyRhythmJson?: string;
  pausedAt?: number | null;
}

export type UpdateGoalInput = Partial<CreateGoalInput> & {
  sortOrder?: number;
  completedAt?: number | null;
};

/** 目标 + 关联任务进度（不含已取消任务）。 */
export interface GoalWithProgress extends Goal {
  totalTasks: number;
  completedTasks: number;
  /** 有效进度百分比 0-100：手动进度优先，否则按任务完成率。 */
  progressPercent: number;
  /** Whether the selected progress method has sufficient data. */
  progressKnown?: boolean;
  /** Percentage of counted leaf tasks with a positive duration estimate (0–100). */
  estimateCoverage?: number;
  progressConfidence?: "known" | "partial" | "unknown" | "manual";
  /** 关联任务累计专注投入（秒）。 */
  focusSeconds: number;
  /** 本周一 00:00 起的实际专注投入（秒）。 */
  weeklyFocusSeconds: number;
  /** 当前阶段名称。 */
  currentPhaseTitle: string | null;
  /** 未完成任务剩余预计耗时（分钟）。 */
  remainingEstimatedMinutes: number;
}

/** 删除长期计划前需要保留的子数据与关联，用于完整撤销。 */
export interface GoalChildrenSnapshot {
  planning: PlanningSnapshot;
  goalId: number;
  phases: Array<typeof longTermPhases.$inferSelect>;
  history: Array<typeof longTermPlanHistory.$inferSelect>;
  taskLinks: Array<{ id: number; phaseId: number | null }>;
  projectIds: number[];
}

/** 计算有效进度：手动进度优先，否则任务完成率；无任务且无手动值为 0。 */
export function goalProgressPercent(
  manualProgress: number | null,
  totalTasks: number,
  completedTasks: number,
): number {
  if (manualProgress != null) return Math.max(0, Math.min(100, manualProgress));
  if (totalTasks === 0) return 0;
  return Math.min(completedTasks < totalTasks ? 99 : 100, Math.round((completedTasks / totalTasks) * 100));
}

export class GoalRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateGoalInput): Promise<Goal> {
    const now = Date.now();
    const rows = await this.db
      .insert(goals)
      .values({
        title: input.title,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        startDate: input.startDate ?? null,
        priority: input.priority ?? "medium",
        manualProgress: input.manualProgress ?? null,
        status: input.status ?? "active",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        weeklyTargetMinutes: Math.max(0, input.weeklyTargetMinutes ?? 0),
        progressMode: input.progressMode ?? (input.manualProgress != null ? "manual" : "estimated"),
        estimatedCompletionDate: input.estimatedCompletionDate ?? null,
        currentPhaseId: input.currentPhaseId ?? null,
        nextAction: input.nextAction ?? null,
        weeklyRhythmJson: input.weeklyRhythmJson ?? "[]",
        pausedAt: input.pausedAt ?? null,
      })
      .returning()
      .all();
    const created = rows[0];
    const weeklyHours = Math.round((created.weeklyTargetMinutes / 60) * 10) / 10;
    await this.db.insert(longTermPlanHistory).values({
      goalId: created.id,
      field: "created",
      label: "创建长期计划",
      oldValue: null,
      newValue: `${weeklyHours}h/week · 目标 ${created.deadline ?? "未设置"}`,
      createdAt: now,
    }).run();
    return created;
  }

  async findById(id: number): Promise<Goal | null> {
    const row = await this.db
      .select()
      .from(goals)
      .where(eq(goals.id, id))
      .get();
    return row ?? null;
  }

  /** 全部目标（按 sort_order + id）。 */
  async findAll(): Promise<Goal[]> {
    return this.db.select().from(goals).orderBy(goals.sortOrder, goals.id).all();
  }

  /** 进行中目标。 */
  async listActive(): Promise<Goal[]> {
    return this.db
      .select()
      .from(goals)
      .where(eq(goals.status, "active"))
      .orderBy(goals.sortOrder, goals.id)
      .all();
  }

  /** 已完成目标（历史）。 */
  async listCompleted(): Promise<Goal[]> {
    return this.db
      .select()
      .from(goals)
      .where(inArray(goals.status, ["completed", "archived"]))
      .orderBy(goals.completedAt, goals.id)
      .all();
  }

  /** 进行中目标 + 各自关联任务的完成进度（长期页一次取回）。 */
  async listActiveWithProgress(): Promise<GoalWithProgress[]> {
    const list = await this.withProgress(inArray(goals.status, ["not_started", "active", "paused"]));
    const focusMap = await this.focusSecondsByGoal();
    const weekStart = startOfLocalWeek();
    const weeklyFocusMap = await this.focusSecondsByGoal(weekStart, weekStart + 7 * 86400000);
    const phaseRows = await this.db.select({ id: longTermPhases.id, title: longTermPhases.title }).from(longTermPhases).all();
    const phaseTitles = new Map(phaseRows.map((phase) => [phase.id, phase.title]));
    return list.map((g) => ({
      ...g,
      focusSeconds: focusMap.get(g.id) ?? 0,
      weeklyFocusSeconds: weeklyFocusMap.get(g.id) ?? 0,
      currentPhaseTitle: g.currentPhaseId == null ? null : phaseTitles.get(g.currentPhaseId) ?? null,
    }));
  }

  /** 全部目标（含已完成）+ 进度。 */
  async findAllWithProgress(): Promise<GoalWithProgress[]> {
    const list = await this.withProgress(undefined);
    const focusMap = await this.focusSecondsByGoal();
    const weeklyFocusMap = await this.focusSecondsByGoal(startOfLocalWeek(), startOfLocalWeek() + 7 * 86400000);
    const phaseRows = await this.db.select({ id: longTermPhases.id, title: longTermPhases.title }).from(longTermPhases).all();
    const phaseTitles = new Map(phaseRows.map((phase) => [phase.id, phase.title]));
    return list.map((g) => ({
      ...g,
      focusSeconds: focusMap.get(g.id) ?? 0,
      weeklyFocusSeconds: weeklyFocusMap.get(g.id) ?? 0,
      currentPhaseTitle: g.currentPhaseId == null ? null : phaseTitles.get(g.currentPhaseId) ?? null,
    }));
  }

  /** 各目标关联任务的累计专注投入秒数（独立聚合，避免与任务计数 JOIN 相互膨胀）。 */
  private async focusSecondsByGoal(from?: number, to?: number): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    for (const row of await readFocusSlices(this.db, from, to)) if (row.goalId != null) map.set(row.goalId, (map.get(row.goalId) ?? 0) + row.seconds);
    return map;
  }

  private async withProgress(
    where?: SQL,
  ): Promise<Array<Omit<GoalWithProgress, "focusSeconds" | "weeklyFocusSeconds" | "currentPhaseTitle">>> {
    const base = this.db
      .select({
        id: goals.id,
        title: goals.title,
        description: goals.description,
        deadline: goals.deadline,
        startDate: goals.startDate,
        priority: goals.priority,
        manualProgress: goals.manualProgress,
        status: goals.status,
        sortOrder: goals.sortOrder,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
        completedAt: goals.completedAt,
        weeklyTargetMinutes: goals.weeklyTargetMinutes,
        progressMode: goals.progressMode,
        estimatedCompletionDate: goals.estimatedCompletionDate,
        currentPhaseId: goals.currentPhaseId,
        nextAction: goals.nextAction,
        weeklyRhythmJson: goals.weeklyRhythmJson,
        pausedAt: goals.pausedAt,
        totalTasks: count(tasks.id),
        estimatedTasks: sql<number>`coalesce(sum(case when ${tasks.estimatedDuration} > 0 then 1 else 0 end), 0)`,
        completedTasks: sql<number>`coalesce(sum(case when ${tasks.status} = 'COMPLETED' then 1 else 0 end), 0)`,
        estimatedMinutes: sql<number>`coalesce(sum(case when ${tasks.status} != 'CANCELLED' then coalesce(${tasks.estimatedDuration}, 0) else 0 end), 0) / 60`,
        completedEstimatedMinutes: sql<number>`coalesce(sum(case when ${tasks.status} = 'COMPLETED' then coalesce(${tasks.estimatedDuration}, 0) else 0 end), 0) / 60`,
        remainingEstimatedMinutes: sql<number>`coalesce(sum(case when ${tasks.status} not in ('COMPLETED', 'CANCELLED') then coalesce(${tasks.estimatedDuration}, 0) else 0 end), 0) / 60`,
      })
      .from(goals)
      .leftJoin(
        tasks,
        and(eq(tasks.goalId, goals.id), ne(tasks.status, "CANCELLED"), sql`not exists (
          select 1 from tasks as child
          where child.parent_id = ${tasks.id} and child.goal_id = ${goals.id} and child.status != 'CANCELLED'
        )`),
      )
      .groupBy(goals.id)
      .orderBy(goals.sortOrder, goals.id);
    const rows = where ? await base.where(where).all() : await base.all();
    return rows.map((r) => {
      const totalTasks = Number(r.totalTasks);
      const completedTasks = Number(r.completedTasks);
      const estimatedMinutes = Number(r.estimatedMinutes);
      const completedEstimatedMinutes = Number(r.completedEstimatedMinutes);
      const estimatedTasks = Number(r.estimatedTasks);
      const hasCompleteEstimates = totalTasks > 0 && estimatedTasks === totalTasks;
      const isManual = r.progressMode === "manual" && r.manualProgress != null;
      const progressKnown = isManual || (totalTasks > 0 && (r.progressMode === "tasks" || hasCompleteEstimates));
      const progressConfidence: GoalWithProgress["progressConfidence"] = isManual ? "manual"
        : progressKnown ? "known" : estimatedTasks > 0 ? "partial" : "unknown";
      const automaticProgress = r.progressMode === "estimated" && hasCompleteEstimates && estimatedMinutes > 0
        ? Math.round((completedEstimatedMinutes / estimatedMinutes) * 100)
        : goalProgressPercent(null, totalTasks, completedTasks);
      return {
        ...r,
        totalTasks,
        completedTasks,
        progressKnown,
        estimateCoverage: totalTasks > 0 ? Math.min(hasCompleteEstimates ? 100 : 99, Math.round((estimatedTasks / totalTasks) * 100)) : 0,
        progressConfidence,
        progressPercent: isManual
          ? goalProgressPercent(r.manualProgress, totalTasks, completedTasks)
        : Math.min(completedTasks < totalTasks ? 99 : 100, automaticProgress),
        remainingEstimatedMinutes: Number(r.remainingEstimatedMinutes),
      };
    });
  }

  async update(id: number, input: UpdateGoalInput): Promise<Goal | null> {
    const before = await this.findById(id);
    const rows = await this.db
      .update(goals)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(goals.id, id))
      .returning()
      .all();
    const updated = rows[0] ?? null;
    if (before && updated) await this.recordImportantChanges(before, updated);
    return updated;
  }

  /** 完成目标（保留数据，不删除；重复完成幂等）。 */
  async complete(id: number): Promise<Goal | null> {
    return this.update(id, { status: "completed", completedAt: Date.now(), pausedAt: null });
  }

  /** 物理删除（关联任务/项目保留并解绑；阶段与历史随计划删除）。 */
  async delete(id: number): Promise<boolean> {
    const phaseRows = await this.db
      .select({ id: longTermPhases.id })
      .from(longTermPhases)
      .where(eq(longTermPhases.goalId, id))
      .all();
    const phaseIds = phaseRows.map((row) => row.id);
    if (phaseIds.length > 0) {
      await this.db.update(tasks).set({ phaseId: null }).where(inArray(tasks.phaseId, phaseIds)).run();
    }
    await this.unlinkTasks(id);
    await this.db.update(projects).set({ goalId: null }).where(eq(projects.goalId, id)).run();
    // 显式删除保证即使某个 SQLite 连接未启用 FK pragma，也不会留下孤儿数据。
    await this.db.delete(longTermPlanHistory).where(eq(longTermPlanHistory.goalId, id)).run();
    await this.db.delete(longTermPhases).where(eq(longTermPhases.goalId, id)).run();
    const rows = await this.db
      .delete(goals)
      .where(eq(goals.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /* ---------- 撤销支持（v1.6.2：目标操作全量可撤销） ---------- */

  /** 捕获计划的阶段、历史，以及任务/项目关联。 */
  async snapshotChildren(goalId: number): Promise<GoalChildrenSnapshot> {
    const [phaseRows, historyRows, taskRows, projectRows] = await Promise.all([
      this.db.select().from(longTermPhases).where(eq(longTermPhases.goalId, goalId)).all(),
      this.db.select().from(longTermPlanHistory).where(eq(longTermPlanHistory.goalId, goalId)).all(),
      this.db
        .select({ id: tasks.id, phaseId: tasks.phaseId })
        .from(tasks)
        .where(eq(tasks.goalId, goalId))
        .all(),
      this.db.select({ id: projects.id }).from(projects).where(eq(projects.goalId, goalId)).all(),
    ]);
    return {
      goalId,
      planning: await snapshotPlanning(this.db, `plan:${goalId}`),
      phases: phaseRows,
      history: historyRows,
      taskLinks: taskRows,
      projectIds: projectRows.map((row) => row.id),
    };
  }

  /** 还原删除计划时一并移除或解绑的子数据。目标行必须先存在。 */
  async restoreChildren(snapshot: GoalChildrenSnapshot): Promise<void> {
    if (snapshot.phases.length > 0) {
      await this.db.insert(longTermPhases).values(snapshot.phases).run();
    }
    if (snapshot.history.length > 0) {
      await this.db.insert(longTermPlanHistory).values(snapshot.history).run();
    }
    if (snapshot.projectIds.length > 0) {
      await this.db
        .update(projects)
        .set({ goalId: snapshot.goalId })
        .where(inArray(projects.id, snapshot.projectIds))
        .run();
    }
    for (const task of snapshot.taskLinks) {
      await this.db
        .update(tasks)
        .set({ goalId: snapshot.goalId, phaseId: task.phaseId })
        .where(eq(tasks.id, task.id))
        .run();
    }
    await restorePlanning(this.db, snapshot.planning);
  }

  /** 以显式 id 还原被删除的目标（撤销删除用）。 */
  async insertRestored(goal: Goal): Promise<void> {
    await this.db
      .insert(goals)
      .values({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        deadline: goal.deadline,
        startDate: goal.startDate,
        priority: goal.priority,
        manualProgress: goal.manualProgress,
        status: goal.status,
        sortOrder: goal.sortOrder,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
        completedAt: goal.completedAt,
        weeklyTargetMinutes: goal.weeklyTargetMinutes,
        progressMode: goal.progressMode,
        estimatedCompletionDate: goal.estimatedCompletionDate,
        currentPhaseId: goal.currentPhaseId,
        nextAction: goal.nextAction,
        weeklyRhythmJson: goal.weeklyRhythmJson,
        pausedAt: goal.pausedAt,
      })
      .run();
  }

  /** 关联到某目标的任务 id（删除撤销需恢复 goal_id 关联）。 */
  async taskIdsByGoal(goalId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.goalId, goalId))
      .all();
    return rows.map((r) => r.id);
  }

  /** 把一批任务重新关联到目标（还原 FK SET NULL 的影响）。 */
  async relinkTasks(taskIds: number[], goalId: number): Promise<void> {
    if (taskIds.length === 0) return;
    await this.db.update(tasks).set({ goalId }).where(inArray(tasks.id, taskIds)).run();
  }

  /** 解绑某目标下的任务（goal_id 置空）。 */
  async unlinkTasks(goalId: number): Promise<void> {
    await this.db.update(tasks).set({ goalId: null }).where(eq(tasks.goalId, goalId)).run();
  }

  /** 标题模糊搜索（命令面板用）：进行中优先、按更新时间倒序。 */
  async searchByTitle(query: string, limit = 10): Promise<Goal[]> {
    const q = `%${query.trim()}%`;
    return this.db
      .select()
      .from(goals)
      .where(like(goals.title, q))
      .orderBy(goals.status, desc(goals.updatedAt))
      .limit(limit)
      .all();
  }

  /** 活跃但 [from, to) 内无任何关联任务完成的目标（v1.9 停滞告警；仅含已挂任务的目标）。 */
  async listActiveStalled(from: number, to: number): Promise<Array<{ id: number; title: string }>> {
    return this.db
      .select({ id: goals.id, title: goals.title })
      .from(goals)
      .leftJoin(tasks, and(eq(tasks.goalId, goals.id), ne(tasks.status, "CANCELLED")))
      .where(eq(goals.status, "active"))
      .groupBy(goals.id)
      .having(
        and(
          sql`count(${tasks.id}) > 0`,
          sql`coalesce(sum(case when ${tasks.completedAt} >= ${from} and ${tasks.completedAt} < ${to} then 1 else 0 end), 0) = 0`,
        ),
      )
      .orderBy(goals.sortOrder, goals.id)
      .all();
  }

  private async recordImportantChanges(before: Goal, after: Goal): Promise<void> {
    const fields: Array<[keyof Goal, string, string]> = [
      ["weeklyTargetMinutes", "每周投入", "weekly_target"],
      ["deadline", "目标日期", "target_date"],
      ["status", "计划状态", "status"],
      ["priority", "优先级", "priority"],
      ["currentPhaseId", "当前阶段", "current_phase"],
      ["progressMode", "进度方式", "progress_mode"],
    ];
    const changes = fields.flatMap(([key, label, field]) => {
      if (before[key] === after[key]) return [];
      return [{
        goalId: after.id,
        field,
        label,
        oldValue: before[key] == null ? null : String(before[key]),
        newValue: after[key] == null ? null : String(after[key]),
        createdAt: Date.now(),
      }];
    });
    if (changes.length > 0) await this.db.insert(longTermPlanHistory).values(changes).run();
  }
}
