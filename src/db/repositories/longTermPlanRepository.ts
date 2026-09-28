import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { focusSessions, goals, longTermPhases, longTermPlanHistory, tasks } from "../schema";
import type { Task } from "./taskRepository";

export type LongTermPhase = typeof longTermPhases.$inferSelect;
export type LongTermPlanHistoryEntry = typeof longTermPlanHistory.$inferSelect;

export interface PhaseWithProgress extends LongTermPhase {
  actualMinutes: number;
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

export interface CreatePhaseInput {
  title: string;
  estimatedMinutes?: number | null;
  manualProgress?: number | null;
  status?: string;
}

export class LongTermPlanRepository {
  constructor(private readonly db: Db) {}

  async createPhase(goalId: number, input: CreatePhaseInput): Promise<LongTermPhase> {
    const now = Date.now();
    const current = await this.db
      .select({ max: sql<number>`coalesce(max(${longTermPhases.sortOrder}), -1)` })
      .from(longTermPhases)
      .where(eq(longTermPhases.goalId, goalId))
      .get();
    const rows = await this.db
      .insert(longTermPhases)
      .values({
        goalId,
        title: input.title.trim(),
        sortOrder: Number(current?.max ?? -1) + 1,
        estimatedMinutes: input.estimatedMinutes ?? null,
        manualProgress: input.manualProgress ?? null,
        status: input.status ?? "not_started",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    const created = rows[0];
    await this.addHistory(goalId, "phase_created", "添加阶段", null, created.title);
    return created;
  }

  async listPhases(goalId: number): Promise<PhaseWithProgress[]> {
    const phases = await this.db
      .select()
      .from(longTermPhases)
      .where(eq(longTermPhases.goalId, goalId))
      .orderBy(asc(longTermPhases.sortOrder), asc(longTermPhases.id))
      .all();
    const planTasks = await this.listTasks(goalId);
    const actualRows = await this.db
      .select({
        phaseId: tasks.phaseId,
        seconds: sql<number>`coalesce(sum(${focusSessions.actualDuration}), 0)`,
      })
      .from(focusSessions)
      .innerJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .where(eq(tasks.goalId, goalId))
      .groupBy(tasks.phaseId)
      .all();
    const actualMap = new Map(actualRows.map((row) => [row.phaseId, Number(row.seconds)]));

    return phases.map((phase) => {
      const phaseTasks = planTasks.filter((task) => task.phaseId === phase.id && task.status !== "CANCELLED");
      const completedTasks = phaseTasks.filter((task) => task.status === "COMPLETED").length;
      const estimatedTotal = phaseTasks.reduce((sum, task) => sum + Math.max(0, (task.estimatedDuration ?? 0) / 60), 0);
      const estimatedDone = phaseTasks
        .filter((task) => task.status === "COMPLETED")
        .reduce((sum, task) => sum + Math.max(0, (task.estimatedDuration ?? 0) / 60), 0);
      const automatic = estimatedTotal > 0
        ? Math.round((estimatedDone / estimatedTotal) * 100)
        : phaseTasks.length > 0
          ? Math.round((completedTasks / phaseTasks.length) * 100)
          : 0;
      return {
        ...phase,
        actualMinutes: Math.round((actualMap.get(phase.id) ?? 0) / 60),
        totalTasks: phaseTasks.length,
        completedTasks,
        progressPercent: phase.manualProgress ?? automatic,
      };
    });
  }

  async updatePhase(
    id: number,
    input: Partial<Pick<LongTermPhase, "title" | "estimatedMinutes" | "manualProgress" | "status" | "sortOrder">>,
  ): Promise<LongTermPhase | null> {
    const rows = await this.db
      .update(longTermPhases)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(longTermPhases.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async reorderPhases(orderedIds: number[]): Promise<void> {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await this.updatePhase(orderedIds[index], { sortOrder: index });
    }
  }

  async deletePhase(id: number): Promise<boolean> {
    const phase = await this.db.select().from(longTermPhases).where(eq(longTermPhases.id, id)).get();
    if (!phase) return false;
    await this.db.update(tasks).set({ phaseId: null }).where(eq(tasks.phaseId, id)).run();
    await this.db.update(goals).set({ currentPhaseId: null, updatedAt: Date.now() }).where(eq(goals.currentPhaseId, id)).run();
    const rows = await this.db.delete(longTermPhases).where(eq(longTermPhases.id, id)).returning().all();
    if (rows.length > 0) await this.addHistory(phase.goalId, "phase_deleted", "删除阶段", phase.title, null);
    return rows.length > 0;
  }

  async listTasks(goalId: number): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.goalId, goalId))
      .orderBy(asc(tasks.status), asc(tasks.scheduledDate), asc(tasks.sortOrder), asc(tasks.id))
      .all();
  }

  async addHistory(
    goalId: number,
    field: string,
    label: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<LongTermPlanHistoryEntry> {
    const rows = await this.db
      .insert(longTermPlanHistory)
      .values({ goalId, field, label, oldValue, newValue, createdAt: Date.now() })
      .returning()
      .all();
    return rows[0];
  }

  async listHistory(goalId: number): Promise<LongTermPlanHistoryEntry[]> {
    return this.db
      .select()
      .from(longTermPlanHistory)
      .where(eq(longTermPlanHistory.goalId, goalId))
      .orderBy(sql`${longTermPlanHistory.createdAt} desc`, sql`${longTermPlanHistory.id} desc`)
      .all();
  }
}
