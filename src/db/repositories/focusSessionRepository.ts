import { and, count, eq, gte, isNull, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../db";
import { focusSessions } from "../schema";

export type FocusSession = typeof focusSessions.$inferSelect;

export interface CreateFocusSessionInput {
  taskId: number;
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

  /** 统计 [from, to) 时间段内开始的会话的实际时长总和（秒）。 */
  async getTotalActualDuration(from: number, to: number): Promise<number> {
    const rows = await this.db
      .select({ total: sum(focusSessions.actualDuration) })
      .from(focusSessions)
      .where(
        and(
          gte(focusSessions.startedAt, from),
          lt(focusSessions.startedAt, to),
        ),
      )
      .all();
    return Number(rows[0]?.total ?? 0);
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
}
