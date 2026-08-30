import { and, count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db";
import { focusSessions } from "../schema";

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
}
