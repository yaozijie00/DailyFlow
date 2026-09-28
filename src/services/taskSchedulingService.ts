import { inArray, sql } from "drizzle-orm";
import type { Db } from "../db/db";
import { tasks } from "../db/schema";
import { undoManager, type UndoManager } from "../lib/undoManager";
import { bumpDataVersion } from "../lib/dataVersion";

type Schedule = Pick<typeof tasks.$inferSelect, "id" | "scheduledDate" | "plannedStart" | "plannedEnd" | "status">;

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** One SQLite statement is atomic even through the plugin's pooled connections. */
export class TaskSchedulingService {
  constructor(private readonly db: Db, private readonly history: UndoManager = undoManager) {}

  async move(taskIds: number[], date: string): Promise<number> {
    if (!isLocalDate(date)) throw new Error("请选择有效日期");
    const ids = [...new Set(taskIds)];
    if (ids.length === 0) return 0;
    const rows = await this.db.select().from(tasks).where(inArray(tasks.id, ids)).all();
    if (rows.length !== ids.length) throw new Error("部分任务已被删除，请刷新后重新选择");
    if (rows.some((row) => row.status === "COMPLETED" || row.status === "CANCELLED")) {
      throw new Error("已完成或取消的任务不能重新安排");
    }
    const before: Schedule[] = rows.filter((row) => row.scheduledDate !== date);
    if (before.length === 0) return 0;
    const after = before.map((row) => ({ ...row, scheduledDate: date, plannedStart: null, plannedEnd: null }));
    await this.apply(before, after);
    if (!this.history.applying) this.history.push({
      type: "task.reschedule", label: `重新安排 ${before.length} 项任务`,
      undo: () => this.apply(after, before),
      redo: () => this.apply(before, after),
    });
    return before.length;
  }

  private async apply(expected: Schedule[], next: Schedule[]): Promise<void> {
    const matches = expected.map((row) => sql`(id = ${row.id} AND scheduled_date = ${row.scheduledDate}
      AND planned_start IS ${row.plannedStart} AND planned_end IS ${row.plannedEnd} AND status = ${row.status})`);
    const cases = (field: "scheduledDate" | "plannedStart" | "plannedEnd") =>
      sql`CASE id ${sql.join(next.map((row) => sql`WHEN ${row.id} THEN ${row[field]}`), sql` `)} END`;
    // Materialize the guard before updating so a concurrent edit prevents the whole action.
    const result = await this.db.values(sql`WITH ready AS MATERIALIZED (
      SELECT count(*) AS matched FROM tasks WHERE ${sql.join(matches, sql` OR `)}
    ) UPDATE tasks SET scheduled_date = ${cases("scheduledDate")},
      planned_start = ${cases("plannedStart")}, planned_end = ${cases("plannedEnd")}, updated_at = ${Date.now()}
      WHERE id IN (${sql.join(next.map((row) => sql`${row.id}`), sql`, `)})
      AND (SELECT matched FROM ready) = ${expected.length} RETURNING id`);
    if (result.length !== expected.length) throw new Error("任务安排已变化，请刷新后重试；未覆盖现有安排");
    bumpDataVersion("task");
    bumpDataVersion("goal");
  }
}
