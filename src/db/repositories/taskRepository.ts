import { and, count, desc, eq, gte, like, lt, sql } from "drizzle-orm";
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
  /** 关联的长期目标（可空） */
  goalId?: number | null;
  /** 所属项目（v1.8 Goal→Project→Task；可空） */
  projectId?: number | null;
  /** 父任务 id（v1.8 拆分；可空） */
  parentId?: number | null;
  /** 重复规则（'' 不重复 / daily / weekdays / weekly / monthly） */
  repeatRule?: string;
}

export type UpdateTaskInput = Partial<CreateTaskInput> & { sortOrder?: number };

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
        goalId: input.goalId ?? null,
        projectId: input.projectId ?? null,
        parentId: input.parentId ?? null,
        repeatRule: input.repeatRule ?? "",
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
      .orderBy(tasks.sortOrder, tasks.id)
      .all();
  }

  /** 按 scheduledDate 范围 [fromDate, toDate) 查询任务（统计「每日任务」用）。 */
  async listInDateRange(fromDate: string, toDate: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(gte(tasks.scheduledDate, fromDate), lt(tasks.scheduledDate, toDate)))
      .orderBy(tasks.scheduledDate, tasks.sortOrder, tasks.id)
      .all();
  }

  /** 按传入 id 顺序重写 sort_order（手动拖动排序）。 */
  async reorder(orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(tasks)
        .set({ sortOrder: i })
        .where(eq(tasks.id, orderedIds[i]))
        .run();
    }
  }

  /** 按计划时间重排某日任务的 sort_order（有时间的升序在前，无时间按创建顺序在后）。 */
  async reorderByTime(date: string): Promise<void> {
    const rows = await this.db
      .select({ id: tasks.id, plannedStart: tasks.plannedStart, createdAt: tasks.createdAt })
      .from(tasks)
      .where(eq(tasks.scheduledDate, date))
      .all();
    rows.sort((a, b) => {
      const as = a.plannedStart ?? Number.MAX_SAFE_INTEGER;
      const bs = b.plannedStart ?? Number.MAX_SAFE_INTEGER;
      if (as !== bs) return as - bs;
      return a.createdAt - b.createdAt;
    });
    for (let i = 0; i < rows.length; i++) {
      await this.db
        .update(tasks)
        .set({ sortOrder: i })
        .where(eq(tasks.id, rows[i].id))
        .run();
    }
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

  /** 以原 id 重建任务行（撤销「删除任务」用；AUTOINCREMENT 接受显式 id）。 */
  async insertRestored(task: Task): Promise<void> {
    await this.db.insert(tasks).values(task).run();
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

  /** [from, to) 内创建的任务按状态计数（统计总览用）。 */
  async countCreatedInRange(
    from: number,
    to: number,
  ): Promise<{ total: number; completed: number; cancelled: number }> {
    const rows = await this.db
      .select({
        status: tasks.status,
        n: count(),
      })
      .from(tasks)
      .where(and(gte(tasks.createdAt, from), lt(tasks.createdAt, to)))
      .groupBy(tasks.status)
      .all();
    let total = 0;
    let completed = 0;
    let cancelled = 0;
    for (const r of rows) {
      total += r.n;
      if (r.status === "COMPLETED") completed += r.n;
      else if (r.status === "CANCELLED") cancelled += r.n;
    }
    return { total, completed, cancelled };
  }

  /** [from, to) 内完成的任务（completedAt 落在区间），供完成数/每日完成趋势聚合。 */
  async listCompletedInRange(
    from: number,
    to: number,
  ): Promise<{ id: number; completedAt: number | null }[]> {
    return this.db
      .select({ id: tasks.id, completedAt: tasks.completedAt })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "COMPLETED"),
          gte(tasks.completedAt, from),
          lt(tasks.completedAt, to),
        ),
      )
      .all();
  }

  /** [from, to) 内完成的任务完整行（v1.6.2 预计 vs 实际 对比用）。 */
  async listCompletedTasksInRange(from: number, to: number): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "COMPLETED"),
          gte(tasks.completedAt, from),
          lt(tasks.completedAt, to),
        ),
      )
      .all();
  }

  /** 标题模糊搜索（命令面板/全局查找用）：按日期倒序，最多 limit 条。 */
  async searchByTitle(query: string, limit = 15): Promise<Task[]> {
    const q = `%${query.trim()}%`;
    return this.db
      .select()
      .from(tasks)
      .where(like(tasks.title, q))
      .orderBy(desc(tasks.scheduledDate), desc(tasks.id))
      .limit(limit)
      .all();
  }
}
