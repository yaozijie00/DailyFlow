import { readFocusSlices } from "../focusAnalytics";
import { and, count, desc, eq, gte, like, lt, inArray, sql } from "drizzle-orm";
import type { Db } from "../db";
import { tasks, longTermPhases } from "../schema";
import type { TaskPriority } from "../../lib/taskPriority";
import { DEFAULT_TASK_PRIORITY } from "../../lib/taskPriority";
import { taskPlanningRanges, inboxLinks } from "../ganttSchema";

type StoredTask = typeof tasks.$inferSelect;
/** Optional migration fields keep source-compatible fixtures/extensions while old databases migrate. */
export type Task = Omit<StoredTask, "repeatSourceId" | "phaseId" | "sourceNoteId"> & {
  sourceNoteId?: number | null;
  repeatSourceId?: number | null;
  phaseId?: number | null;
};

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
  /** 归属课程（2.0.x；可空） */
  courseId?: number | null;
  /** 重复规则（'' 不重复 / daily / weekdays / weekly / monthly） */
  repeatRule?: string;
  /** Stable root id for a repeated-task series. */
  repeatSourceId?: number | null;
  /** 优先级（v2.3.x；缺省 = medium） */
  priority?: TaskPriority;
  /** 长期计划阶段（固定一层，可空） */
  phaseId?: number | null;
}

export type UpdateTaskInput = Partial<CreateTaskInput> & { sortOrder?: number };

export class TaskRepository {
  constructor(private readonly db: Db) {}
  async phases(goalId:number) { return this.db.select().from(longTermPhases).where(eq(longTermPhases.goalId,goalId)).orderBy(longTermPhases.sortOrder).all(); }
  async snapshotVisuals(id: number) {
    const [range,links] = await Promise.all([this.db.select().from(taskPlanningRanges).where(eq(taskPlanningRanges.taskId,id)).get(),this.db.select().from(inboxLinks).where(eq(inboxLinks.taskId,id)).all()]);
    return { range:range ?? null,links };
  }
  async restoreVisuals(snapshot: Awaited<ReturnType<TaskRepository["snapshotVisuals"]>>) {
    if (snapshot.range) await this.db.insert(taskPlanningRanges).values(snapshot.range).onConflictDoNothing().run();
    for (const link of snapshot.links) await this.db.insert(inboxLinks).values(link).onConflictDoUpdate({ target:inboxLinks.noteId,set:{ taskId:link.taskId } }).run();
  }

  async children(parentId: number): Promise<Task[]> {
    return this.db.select().from(tasks).where(eq(tasks.parentId, parentId)).orderBy(tasks.sortOrder, tasks.id).all();
  }

  async updateExpected(id: number, input: UpdateTaskInput, expectedVersion: number): Promise<Task | null> {
    const [row] = await this.db.update(tasks).set({ ...input, updatedAt: Math.max(Date.now(), expectedVersion + 1) })
      .where(and(eq(tasks.id, id), eq(tasks.updatedAt, expectedVersion))).returning().all();
    return row ?? null;
  }

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
        courseId: input.courseId ?? null,
        repeatRule: input.repeatRule ?? "",
        repeatSourceId: input.repeatSourceId ?? null,
        priority: input.priority ?? DEFAULT_TASK_PRIORITY,
        phaseId: input.phaseId ?? null,
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

  /** 按 id 批量读取（Extension Data API：课程扩展按 task_links 回查 Core 任务状态）。 */
  async listByIds(ids: number[]): Promise<Task[]> {
    const uniq = [...new Set(ids)].filter((n) => Number.isFinite(n));
    if (uniq.length === 0) return [];
    return this.db.select().from(tasks).where(inArray(tasks.id, uniq)).all();
  }

  async findByDate(scheduledDate: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.scheduledDate, scheduledDate))
      .orderBy(tasks.sortOrder, tasks.id)
      .all();
  }

  /** Find the one occurrence generated for a series and date. */
  async findRepeatOccurrence(repeatSourceId: number, scheduledDate: string): Promise<Task | null> {
    const row = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.repeatSourceId, repeatSourceId), eq(tasks.scheduledDate, scheduledDate)))
      .get();
    return row ?? null;
  }

  /** Adopt a pre-series occurrence created by an older DailyFlow version. */
  async findLegacyRepeatOccurrence(source: Task, scheduledDate: string): Promise<Task | null> {
    const rows = await this.findByDate(scheduledDate);
    const matches = rows.filter((row) =>
      row.repeatSourceId == null &&
      row.title === source.title &&
      row.repeatRule === source.repeatRule &&
      row.categoryId === source.categoryId &&
      row.goalId === source.goalId &&
      row.projectId === source.projectId
    );
    // 多条旧记录无法可靠判断属于哪个系列，宁可保留原记录也不错误合并两个系列。
    return matches.length === 1 ? matches[0] : null;
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
      .set({ ...input, updatedAt: sql`max(${Date.now()},${tasks.updatedAt}+1)` })
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
    await this.db.insert(tasks).values({ ...task, sourceNoteId: null, repeatSourceId: task.repeatSourceId ?? null }).run();
  }

  /** 统计某日执行任务总数与完成数（排除汇总和取消项），单条 SQL 实时聚合。 */
  async countTodayStats(scheduledDate: string): Promise<{ total: number; completed: number }> {
    const rows = await this.db
      .select({
        total: count(),
        completed: sql<number>`coalesce(sum(case when ${tasks.status} = 'COMPLETED' then 1 else 0 end), 0)`,
      })
      .from(tasks)
      .where(and(eq(tasks.scheduledDate,scheduledDate),sql`${tasks.status} != 'CANCELLED'`,sql`NOT EXISTS (SELECT 1 FROM tasks child WHERE child.parent_id=${tasks.id} AND child.status!='CANCELLED')`))
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
          sql`NOT EXISTS (SELECT 1 FROM tasks child WHERE child.parent_id=${tasks.id} AND child.status!='CANCELLED')`,
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
          sql`NOT EXISTS (SELECT 1 FROM tasks child WHERE child.parent_id=${tasks.id} AND child.status!='CANCELLED')`,
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

  /** Core 旧 tasks.course_id 关联（课程 Extension 回填 task_links 用；迁移完成后该列降级为过渡列）。 */
  async listLegacyCoursePairs(): Promise<Array<{ taskId: number; courseId: number }>> {
    const rows = await this.db
      .select({ taskId: tasks.id, courseId: tasks.courseId })
      .from(tasks)
      .where(sql`${tasks.courseId} is not null`)
      .all();
    return rows.flatMap((r) =>
      r.courseId != null ? [{ taskId: r.taskId, courseId: r.courseId }] : [],
    );
  }

  /** 按项目聚合（全部日期）：待办/已完成 任务数 + 关联专注累计秒数（v2.3.x 项目卡）。 */
  async projectAggregates(): Promise<
    Array<{ projectId: number; todo: number; completed: number; seconds: number }>
  > {
    const taskRows = await this.db
      .select({ projectId: tasks.projectId, status: tasks.status })
      .from(tasks)
      .where(sql`${tasks.projectId} is not null`)
      .all();
    const by = new Map<number, { todo: number; completed: number; seconds: number }>();
    for (const r of taskRows) {
      if (r.projectId == null) continue;
      const cur = by.get(r.projectId) ?? { todo: 0, completed: 0, seconds: 0 };
      if (r.status === "COMPLETED") cur.completed += 1;
      else if (r.status === "TODO") cur.todo += 1;
      by.set(r.projectId, cur);
    }
    for (const row of await readFocusSlices(this.db)) {
      if (row.projectId == null) continue;
      const current = by.get(row.projectId) ?? { todo: 0, completed: 0, seconds: 0 };
      current.seconds += row.seconds; by.set(row.projectId, current);
    }
    return [...by.entries()].map(([projectId, v]) => ({ projectId, ...v }));
  }
}
