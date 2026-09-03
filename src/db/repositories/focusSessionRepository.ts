import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { categories, focusSessions, tasks } from "../schema";

export type FocusSession = typeof focusSessions.$inferSelect;

/** 统计/成就聚合用的轻量投影（避免加载整行）。 */
export interface FocusSessionAggregate {
  categoryId: number | null;
  actualDuration: number;
  completed: boolean;
  startedAt: number;
}

export interface CreateFocusSessionInput {
  taskId: number;
  /** 专注开始时刻任务所属类别的快照（可空，类别已删/未分类） */
  categoryId?: number | null;
  plannedDuration: number;
  startedAt: number;
  actualDuration?: number;
  endedAt?: number | null;
  completed?: boolean;
}

export type UpdateFocusSessionInput = Partial<CreateFocusSessionInput>;

export class FocusSessionRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateFocusSessionInput): Promise<FocusSession> {
    const rows = await this.db
      .insert(focusSessions)
      .values({
        taskId: input.taskId,
        categoryId: input.categoryId ?? null,
        plannedDuration: input.plannedDuration,
        actualDuration: input.actualDuration ?? 0,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        completed: input.completed ?? false,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return rows[0];
  }

  async findById(id: number): Promise<FocusSession | null> {
    const row = await this.db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.id, id))
      .get();
    return row ?? null;
  }

  /** 查找进行中的会话（ended_at IS NULL），最多一个。 */
  async findOpen(): Promise<FocusSession | null> {
    const row = await this.db
      .select()
      .from(focusSessions)
      .where(isNull(focusSessions.endedAt))
      .get();
    return row ?? null;
  }

  async findByTaskId(taskId: number): Promise<FocusSession[]> {
    return this.db
      .select()
      .from(focusSessions)
      .where(eq(focusSessions.taskId, taskId))
      .all();
  }

  /** 删除某任务的全部专注会话（删除任务时清理其统计数据）。 */
  async deleteByTaskId(taskId: number): Promise<void> {
    await this.db
      .delete(focusSessions)
      .where(eq(focusSessions.taskId, taskId))
      .run();
  }

  async update(
    id: number,
    input: UpdateFocusSessionInput,
  ): Promise<FocusSession | null> {
    const rows = await this.db
      .update(focusSessions)
      .set(input)
      .where(eq(focusSessions.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(focusSessions)
      .where(eq(focusSessions.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /** 以原 id 重建专注会话（撤销「删除任务」时连带恢复其专注历史）。 */
  async insertRestored(session: FocusSession): Promise<void> {
    await this.db.insert(focusSessions).values(session).run();
  }

  /** 统计 [from, to) 内开始会话的总实际时长（秒）与次数，单条 SQL 实时聚合。 */
  async getTodayStats(from: number, to: number): Promise<{ totalSeconds: number; count: number }> {
    const rows = await this.db
      .select({
        totalSeconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
        count: count(),
      })
      .from(focusSessions)
      .where(
        and(
          gte(focusSessions.startedAt, from),
          lt(focusSessions.startedAt, to),
        ),
      )
      .all();
    return {
      totalSeconds: Number(rows[0]?.totalSeconds ?? 0),
      count: rows[0]?.count ?? 0,
    };
  }

  /** 列出 [from, to) 内开始的所有会话（轻量投影），供统计/成就统一聚合。 */
  async listInRange(from: number, to: number): Promise<FocusSessionAggregate[]> {
    return this.db
      .select({
        categoryId: focusSessions.categoryId,
        actualDuration: focusSessions.actualDuration,
        completed: focusSessions.completed,
        startedAt: focusSessions.startedAt,
      })
      .from(focusSessions)
      .where(
        and(
          gte(focusSessions.startedAt, from),
          lt(focusSessions.startedAt, to),
        ),
      )
      .all();
  }

  /** 列出全部会话（轻量投影），供成就上下文构建（累计口径需全历史）。 */
  async listAll(): Promise<FocusSessionAggregate[]> {
    return this.db
      .select({
        categoryId: focusSessions.categoryId,
        actualDuration: focusSessions.actualDuration,
        completed: focusSessions.completed,
        startedAt: focusSessions.startedAt,
      })
      .from(focusSessions)
      .all();
  }

  /* ---------- 专注页历史（v1.6.2：今日专注列表 + 任务/分类名） ---------- */

  /** 列出 [from, to) 内开始会话的明细，按开始时间倒序（任务已删除时标题兜底）。 */
  async listWithTaskInRange(from: number, to: number): Promise<FocusSessionDetail[]> {
    return this.db
      .select({
        id: focusSessions.id,
        taskId: focusSessions.taskId,
        taskTitle: sql<string>`coalesce(${tasks.title}, '已删除任务')`,
        categoryName: categories.name,
        plannedDuration: focusSessions.plannedDuration,
        actualDuration: focusSessions.actualDuration,
        startedAt: focusSessions.startedAt,
        endedAt: focusSessions.endedAt,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .leftJoin(categories, eq(categories.id, focusSessions.categoryId))
      .where(and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)))
      .orderBy(desc(focusSessions.startedAt))
      .all();
  }

  /* ---------- v1.7：SQL 级聚合（统计不下沉数据到 JS，10 万级会话不卡） ---------- */

  /** [from, to) 单条 SQL 汇总：总秒 / 次数 / 走满数。 */
  async summaryInRange(
    from: number,
    to: number,
  ): Promise<{ totalSeconds: number; count: number; completedCount: number }> {
    const rows = await this.db
      .select({
        totalSeconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
        count: count(),
        completedCount: sql<number>`coalesce(sum(case when ${focusSessions.completed} then 1 else 0 end), 0)`,
      })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)))
      .all();
    const r = rows[0];
    return {
      totalSeconds: Number(r?.totalSeconds ?? 0),
      count: r?.count ?? 0,
      completedCount: Number(r?.completedCount ?? 0),
    };
  }

  /** [from, to) 按本地日期 GROUP BY：每日总秒/走满数。 */
  async dailyAggregateInRange(
    from: number,
    to: number,
  ): Promise<Array<{ date: string; seconds: number; completedCount: number }>> {
    const dateExpr = sql<string>`strftime('%Y-%m-%d', ${focusSessions.startedAt}/1000, 'unixepoch', 'localtime')`;
    const rows = await this.db
      .select({
        date: dateExpr,
        seconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
        completedCount: sql<number>`coalesce(sum(case when ${focusSessions.completed} then 1 else 0 end), 0)`,
      })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)))
      .groupBy(dateExpr)
      .all();
    return rows.map((r) => ({
      date: String(r.date),
      seconds: Number(r.seconds),
      completedCount: Number(r.completedCount),
    }));
  }

  /** [from, to) 按本地小时 GROUP BY（0..23）。 */
  async hourlyAggregateInRange(
    from: number,
    to: number,
  ): Promise<Array<{ hour: number; seconds: number }>> {
    const hourExpr = sql<number>`cast(strftime('%H', ${focusSessions.startedAt}/1000, 'unixepoch', 'localtime') as integer)`;
    const rows = await this.db
      .select({
        hour: hourExpr,
        seconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
      })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)))
      .groupBy(hourExpr)
      .all();
    return rows.map((r) => ({ hour: Number(r.hour), seconds: Number(r.seconds) }));
  }

  /** [from, to) 按类别 GROUP BY（category_id 快照；服务层负责名称映射）。 */
  async categoryAggregateInRange(
    from: number,
    to: number,
  ): Promise<Array<{ categoryId: number | null; seconds: number; count: number }>> {
    const rows = await this.db
      .select({
        categoryId: focusSessions.categoryId,
        seconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
        count: count(),
      })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)))
      .groupBy(focusSessions.categoryId)
      .all();
    return rows.map((r) => ({
      categoryId: r.categoryId,
      seconds: Number(r.seconds),
      count: r.count ?? 0,
    }));
  }
}

/** 会话 + 任务/分类名的明细（专注页「今日专注」列表用）。 */
export interface FocusSessionDetail {
  id: number;
  taskId: number | null;
  taskTitle: string;
  categoryName: string | null;
  plannedDuration: number;
  actualDuration: number;
  startedAt: number;
  endedAt: number | null;
  completed: boolean;
}
