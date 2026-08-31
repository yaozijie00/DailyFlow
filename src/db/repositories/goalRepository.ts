import { and, count, eq, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db";
import { goals, tasks } from "../schema";

export type Goal = typeof goals.$inferSelect;

export type GoalStatus = "active" | "completed";

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  deadline?: string | null;
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
    return this.withProgress(eq(goals.status, "active"));
  }

  /** 全部目标（含已完成）+ 进度。 */
  async findAllWithProgress(): Promise<GoalWithProgress[]> {
    return this.withProgress(undefined);
  }

  private async withProgress(where?: SQL): Promise<GoalWithProgress[]> {
    const base = this.db
      .select({
        id: goals.id,
        title: goals.title,
        description: goals.description,
        deadline: goals.deadline,
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
    return rows.map((r) => ({
      ...r,
      totalTasks: Number(r.totalTasks),
      completedTasks: Number(r.completedTasks),
    }));
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

  /** 物理删除（关联任务保留，goal_id 置空）。 */
  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(goals)
      .where(eq(goals.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }
}
