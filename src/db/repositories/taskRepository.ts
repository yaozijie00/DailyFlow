import { count, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { tasks } from "../schema";

export type Task = typeof tasks.$inferSelect;

export interface CreateTaskInput {
  title: string;
  scheduledDate: string;
  categoryId?: number | null;
  status?: string;
  estimatedDuration?: number | null;
  plannedStart?: number | null;
  plannedEnd?: number | null;
  actualDuration?: number;
  completedAt?: number | null;
  notes?: string | null;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

export class TaskRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateTaskInput): Promise<Task> {
    const now = Date.now();
    const rows = await this.db
      .insert(tasks)
      .values({
        title: input.title,
        categoryId: input.categoryId ?? null,
        status: input.status ?? "TODO",
        estimatedDuration: input.estimatedDuration ?? null,
        plannedStart: input.plannedStart ?? null,
        plannedEnd: input.plannedEnd ?? null,
        actualDuration: input.actualDuration ?? 0,
        scheduledDate: input.scheduledDate,
        createdAt: now,
        updatedAt: now,
        completedAt: input.completedAt ?? null,
        notes: input.notes ?? null,
      })
      .returning()
      .all();
    return rows[0];
  }

  async findAll(): Promise<Task[]> {
    return this.db.select().from(tasks).all();
  }

  async findById(id: number): Promise<Task | null> {
    const row = await this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    return row ?? null;
  }

  async findByDate(scheduledDate: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.scheduledDate, scheduledDate))
      .all();
  }

  async update(id: number, input: UpdateTaskInput): Promise<Task | null> {
    const rows = await this.db
      .update(tasks)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(tasks.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /** 统计某日任务总数与完成数（含已取消，与任务列表口径一致），单条 SQL 实时聚合。 */
  async countTodayStats(scheduledDate: string): Promise<{ total: number; completed: number }> {
    const rows = await this.db
      .select({
        total: count(),
        completed: sql<number>`coalesce(sum(case when ${tasks.status} = 'COMPLETED' then 1 else 0 end), 0)`,
      })
      .from(tasks)
      .where(eq(tasks.scheduledDate, scheduledDate))
      .all();
    return {
      total: rows[0]?.total ?? 0,
      completed: Number(rows[0]?.completed ?? 0),
    };
  }
}
