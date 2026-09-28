import { readFocusSlices, splitFocusHours } from "../focusAnalytics";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
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
  /** 本次循环计划（2.0.x 双层参数） */
  plannedBreakMinutes?: number | null;
  plannedBreakCount?: number | null;
  plannedPomodoroCount?: number | null;
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
        plannedBreakMinutes: input.plannedBreakMinutes ?? null,
        plannedBreakCount: input.plannedBreakCount ?? null,
        plannedPomodoroCount: input.plannedPomodoroCount ?? null,
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

  /** Undo a task deletion without recreating or losing its metadata/work segments. */
  async reattach(taskId: number, ids: number[]): Promise<void> {
    for (const id of ids) await this.db.update(focusSessions).set({ taskId }).where(and(eq(focusSessions.id, id), isNull(focusSessions.taskId))).run();
  }

  /** 统计 [from, to) 内开始会话的总实际时长（秒）与次数，单条 SQL 实时聚合。 */
  async getTodayStats(from: number, to: number): Promise<{ totalSeconds: number; count: number }> {
    const { totalSeconds, count } = await this.summaryInRange(from, to);
    return { totalSeconds, count };
  }

  /** 列出 [from, to) 内开始的所有会话（轻量投影），供统计/成就统一聚合。 */
  async listInRange(from: number, to: number): Promise<FocusSessionAggregate[]> {
    return splitFocusHours(await readFocusSlices(this.db, from, to)).map((r) => ({ categoryId: r.categoryId, actualDuration: r.seconds, completed: r.completed, startedAt: r.startedAt }));
  }

  /** 列出全部会话（轻量投影），供成就上下文构建（累计口径需全历史）。 */
  async listAll(): Promise<FocusSessionAggregate[]> {
    const slices = await readFocusSlices(this.db);
    const totals = new Map<number, number>();
    for (const row of slices) totals.set(row.sessionId, (totals.get(row.sessionId) ?? 0) + row.seconds);
    return splitFocusHours(slices).map((r) => ({ categoryId: r.categoryId, actualDuration: r.seconds, completed: r.completed && (totals.get(r.sessionId) ?? 0) >= 1500, startedAt: r.startedAt }));
  }

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
  async summaryInRange(from: number, to: number): Promise<{ totalSeconds: number; count: number; completedCount: number }> {
    const rows = await readFocusSlices(this.db, from, to);
    return { totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0), count: new Set(rows.map((row) => row.sessionId)).size, completedCount: new Set(rows.filter((row) => row.completed).map((row) => row.sessionId)).size };
  }

  /** [from, to) 按本地日期 GROUP BY：每日总秒/走满数。 */
  async dailyAggregateInRange(from: number, to: number): Promise<Array<{ date: string; seconds: number; completedCount: number }>> {
    const groups = new Map<string, { seconds: number; completed: Set<number> }>();
    for (const row of splitFocusHours(await readFocusSlices(this.db, from, to))) {
      const group = groups.get(row.date) ?? { seconds: 0, completed: new Set<number>() };
      group.seconds += row.seconds; if (row.completed) group.completed.add(row.sessionId); groups.set(row.date, group);
    }
    return [...groups].map(([date, group]) => ({ date, seconds: group.seconds, completedCount: group.completed.size }));
  }

  /** [from, to) 按本地小时 GROUP BY（0..23）。 */
  async hourlyAggregateInRange(from: number, to: number): Promise<Array<{ hour: number; seconds: number }>> {
    const groups = new Map<number, number>();
    for (const row of splitFocusHours(await readFocusSlices(this.db, from, to))) groups.set(row.hour, (groups.get(row.hour) ?? 0) + row.seconds);
    return [...groups].map(([hour, seconds]) => ({ hour, seconds }));
  }

  /** [from, to) 按类别 GROUP BY（category_id 快照；服务层负责名称映射）。 */
  async categoryAggregateInRange(from: number, to: number): Promise<Array<{ categoryId: number | null; seconds: number; count: number }>> {
    const groups = new Map<number | null, { seconds: number; ids: Set<number> }>();
    for (const row of await readFocusSlices(this.db, from, to)) {
      const group = groups.get(row.categoryId) ?? { seconds: 0, ids: new Set<number>() }; group.seconds += row.seconds; group.ids.add(row.sessionId); groups.set(row.categoryId, group);
    }
    return [...groups].map(([categoryId, group]) => ({ categoryId, seconds: group.seconds, count: group.ids.size }));
  }

  /** [from, to) 按任务所属项目 GROUP BY（v1.9；任务已删/未归项目 → projectId null）。 */
  async projectAggregateInRange(from: number, to: number): Promise<Array<{ projectId: number | null; projectTitle: string | null; seconds: number; count: number }>> {
    const groups = new Map<number | null, { title: string | null; seconds: number; ids: Set<number> }>();
    for (const row of await readFocusSlices(this.db, from, to)) {
      const group = groups.get(row.projectId) ?? { title: row.projectTitle, seconds: 0, ids: new Set<number>() }; group.seconds += row.seconds; group.ids.add(row.sessionId); groups.set(row.projectId, group);
    }
    return [...groups].map(([projectId, group]) => ({ projectId, projectTitle: group.title, seconds: group.seconds, count: group.ids.size }));
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
