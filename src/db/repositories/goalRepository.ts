import { and, count, desc, eq, inArray, isNotNull, like, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { goals, tasks, focusSessions } from "../schema";

export type Goal = typeof goals.$inferSelect;

export type GoalStatus = "active" | "completed";

export type GoalPriority = "high" | "medium" | "low";

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
  /** 关联任务累计专注投入（秒）。 */
  focusSeconds: number;
}

/** 计算有效进度：手动进度优先，否则任务完成率；无任务且无手动值为 0。 */
export function goalProgressPercent(
  manualProgress: number | null,
  totalTasks: number,
  completedTasks: number,
): number {
  if (manualProgress != null) return Math.max(0, Math.min(100, manualProgress));
  if (totalTasks === 0) return 0;
  return Math.round((completedTasks / totalTasks) * 100);
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
      })
      .returning()
      .all();
    return rows[0];
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
      .where(eq(goals.status, "completed"))
      .orderBy(goals.completedAt, goals.id)
      .all();
  }

  /** 进行中目标 + 各自关联任务的完成进度（长期页一次取回）。 */
  async listActiveWithProgress(): Promise<GoalWithProgress[]> {
    const list = await this.withProgress(eq(goals.status, "active"));
    const focusMap = await this.focusSecondsByGoal();
    return list.map((g) => ({ ...g, focusSeconds: focusMap.get(g.id) ?? 0 }));
  }

  /** 全部目标（含已完成）+ 进度。 */
  async findAllWithProgress(): Promise<GoalWithProgress[]> {
    const list = await this.withProgress(undefined);
    const focusMap = await this.focusSecondsByGoal();
    return list.map((g) => ({ ...g, focusSeconds: focusMap.get(g.id) ?? 0 }));
  }

  /** 各目标关联任务的累计专注投入秒数（独立聚合，避免与任务计数 JOIN 相互膨胀）。 */
  private async focusSecondsByGoal(): Promise<Map<number, number>> {
    const rows = await this.db
      .select({
        goalId: tasks.goalId,
        seconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
      })
      .from(focusSessions)
      .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(isNotNull(tasks.goalId))
      .groupBy(tasks.goalId)
      .all();
    const map = new Map<number, number>();
    for (const r of rows) {
      if (r.goalId != null) map.set(r.goalId, Number(r.seconds));
    }
    return map;
  }

  private async withProgress(
    where?: SQL,
  ): Promise<Array<Omit<GoalWithProgress, "focusSeconds">>> {
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
        totalTasks: count(tasks.id),
        completedTasks: sql<number>`coalesce(sum(case when ${tasks.status} = 'COMPLETED' then 1 else 0 end), 0)`,
      })
      .from(goals)
      .leftJoin(
        tasks,
        and(eq(tasks.goalId, goals.id), ne(tasks.status, "CANCELLED")),
      )
      .groupBy(goals.id)
      .orderBy(goals.sortOrder, goals.id);
    const rows = where ? await base.where(where).all() : await base.all();
    return rows.map((r) => {
      const totalTasks = Number(r.totalTasks);
      const completedTasks = Number(r.completedTasks);
      return {
        ...r,
        totalTasks,
        completedTasks,
        progressPercent: goalProgressPercent(r.manualProgress, totalTasks, completedTasks),
      };
    });
  }

  async update(id: number, input: UpdateGoalInput): Promise<Goal | null> {
    const rows = await this.db
      .update(goals)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(goals.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  /** 完成目标（保留数据，不删除；重复完成幂等）。 */
  async complete(id: number): Promise<Goal | null> {
    const rows = await this.db
      .update(goals)
      .set({ status: "completed", completedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(goals.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  /** 物理删除（关联任务保留，goal_id 置空——显式解绑，不依赖 FK pragma）。 */
  async delete(id: number): Promise<boolean> {
    await this.unlinkTasks(id);
    const rows = await this.db
      .delete(goals)
      .where(eq(goals.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /* ---------- 撤销支持（v1.6.2：目标操作全量可撤销） ---------- */

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
}
