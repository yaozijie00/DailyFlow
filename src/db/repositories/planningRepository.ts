import { readFocusSlices } from "../focusAnalytics";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { goals, projects, tasks } from "../schema";
import { planningChanges, planningMeta, planningReviews, planningWeeks } from "../planningSchema";
import { isLocalDate } from "../../services/taskSchedulingService";

export type PlanningMeta = typeof planningMeta.$inferSelect;
export type PlanningWeek = typeof planningWeeks.$inferSelect;
export type PlanningReview = typeof planningReviews.$inferSelect;
export type Lifecycle = "idea" | "not_started" | "preparation" | "ready" | "active" | "paused" | "completed" | "archived";
export type PlanningRef = { kind: "plan" | "project"; id: number; key: string };
export type MetaPatch = Partial<Pick<PlanningMeta, "lifecycle" | "pausedFrom" | "description" | "priority" | "weeklyTargetMinutes" | "targetDate" | "manualProgress" | "nextTaskId" | "preparationJson" | "projectFolder" | "workflowRunId" | "archivedAt" | "sortOrder">>;
export interface ReviewSnapshot { key: string; title: string; plannedMinutes: number | null; actualMinutes: number; originalMinutes?: number | null; completedTasks?: number; }
export interface ReviewInput {
  kind: "week" | "month" | "item"; periodStart: string; periodEnd: string; itemKey?: string;
  snapshot: ReviewSnapshot[]; decisions: Array<{ key: string; decision: string }>; note: string;
}

export function parsePlanningKey(key: string): PlanningRef {
  const match = /^(plan|project):([1-9]\d*)$/.exec(key);
  if (!match || !Number.isSafeInteger(Number(match[2]))) throw new Error("长期事项标识无效");
  return { kind: match[1] as PlanningRef["kind"], id: Number(match[2]), key };
}
export function localDateStamp(value: string): number {
  if (!isLocalDate(value)) throw new Error("日期无效");
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
export function validateMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) throw new Error("每周投入应在 0–168 小时之间");
}

export class PlanningRepository {
  constructor(private readonly db: Db) {}

  async ensureMeta(key: string): Promise<PlanningMeta> {
    const ref = parsePlanningKey(key);
    const existing = await this.getMeta(key);
    if (existing) return existing;
    if (ref.kind === "plan") {
      const goal = await this.db.select().from(goals).where(eq(goals.id, ref.id)).get();
      if (!goal) throw new Error("长期计划已不存在，请刷新");
      await this.db.insert(planningMeta).values({ key, goalId: ref.id, lifecycle: goal.status,
        priority: goal.priority, description: goal.description ?? "", weeklyTargetMinutes: goal.weeklyTargetMinutes,
        targetDate: goal.deadline, manualProgress: goal.progressMode === "manual" ? goal.manualProgress : null, sortOrder: goal.sortOrder,
        archivedAt: goal.status === "archived" ? goal.updatedAt : null, updatedAt: Date.now(),
      }).onConflictDoNothing().run();
    } else {
      const project = await this.db.select().from(projects).where(eq(projects.id, ref.id)).get();
      if (!project) throw new Error("项目已不存在，请刷新");
      await this.db.insert(planningMeta).values({ key, projectId: ref.id, lifecycle: "not_started", sortOrder: project.sortOrder, updatedAt: Date.now() }).onConflictDoNothing().run();
    }
    return (await this.getMeta(key))!;
  }
  async getMeta(key: string): Promise<PlanningMeta | null> {
    return (await this.db.select().from(planningMeta).where(eq(planningMeta.key, key)).get()) ?? null;
  }
  async listMeta(): Promise<PlanningMeta[]> { return this.db.select().from(planningMeta).all(); }
  async updateMeta(key: string, patch: MetaPatch): Promise<PlanningMeta> {
    const ref = parsePlanningKey(key);
    if (patch.weeklyTargetMinutes != null) validateMinutes(patch.weeklyTargetMinutes);
    if (patch.targetDate && !isLocalDate(patch.targetDate)) throw new Error("目标日期无效");
    if (patch.manualProgress != null && (!Number.isFinite(patch.manualProgress) || patch.manualProgress < 0 || patch.manualProgress > 100)) throw new Error("进度应在 0–100 之间");
    if (patch.lifecycle && !["idea","not_started","preparation","ready","active","paused","completed","archived"].includes(patch.lifecycle)) throw new Error("事项状态无效");
    if (patch.nextTaskId != null) {
      const task = await this.db.select().from(tasks).where(eq(tasks.id, patch.nextTaskId)).get();
      if (!task || (ref.kind === "project" ? task.projectId !== ref.id : task.goalId !== ref.id) || ["COMPLETED","CANCELLED"].includes(task.status)) throw new Error("下一步必须是该事项下的未完成任务");
    }
    if (patch.preparationJson !== undefined) {
      const entries: unknown = JSON.parse(patch.preparationJson);
      if (!Array.isArray(entries) || entries.some((entry) => !entry || typeof entry.title !== "string" || typeof entry.done !== "boolean")) throw new Error("准备清单格式无效");
    }
    await this.ensureMeta(key);
    const rows = await this.db.update(planningMeta).set({ ...patch, updatedAt: Date.now() }).where(eq(planningMeta.key, key)).returning().all();
    if (!rows[0]) throw new Error("保存失败，请刷新重试");
    return rows[0];
  }
  async setWeek(key: string, weekStart: string, minutes: number, reason = "", intention?: string): Promise<PlanningWeek> {
    validateMinutes(minutes);
    if (new Date(localDateStamp(weekStart)).getDay() !== 1) throw new Error("周承诺必须从周一开始");
    await this.ensureMeta(key);
    const rows = await this.db.insert(planningWeeks).values({ itemKey: key, weekStart, originalMinutes: minutes, targetMinutes: minutes, reason, intention: intention ?? "", updatedAt: Date.now() })
      .onConflictDoUpdate({ target: [planningWeeks.itemKey, planningWeeks.weekStart], set: { targetMinutes: minutes, reason, ...(intention !== undefined ? { intention } : {}), updatedAt: Date.now() } }).returning().all();
    return rows[0];
  }
  async getWeek(key: string, weekStart: string): Promise<PlanningWeek | null> {
    return (await this.db.select().from(planningWeeks).where(and(eq(planningWeeks.itemKey, key), eq(planningWeeks.weekStart, weekStart))).get()) ?? null;
  }
  async listWeeks(weekStart: string): Promise<PlanningWeek[]> {
    return this.db.select().from(planningWeeks).where(eq(planningWeeks.weekStart, weekStart)).all();
  }
  async history(key: string) {
    return this.db.select().from(planningChanges).where(eq(planningChanges.itemKey, key)).orderBy(desc(planningChanges.id)).limit(200).all();
  }
  async actualMinutes(key: string, from: string, to: string): Promise<number> {
    parsePlanningKey(key);
    return Math.round((await this.actualByItem(from, to)).get(key) ?? 0);
  }
  async actualByItem(from: string, to: string): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const row of await readFocusSlices(this.db, localDateStamp(from), localDateStamp(to))) {
      const key = row.projectId != null ? `project:${row.projectId}` : row.goalId != null ? `plan:${row.goalId}` : null;
      if (key) result.set(key, (result.get(key) ?? 0) + row.seconds / 60);
    }
    return result;
  }
  async saveReview(input: ReviewInput): Promise<string> {
    if (localDateStamp(input.periodEnd) <= localDateStamp(input.periodStart)) throw new Error("复盘结束日期应晚于开始日期");
    if (input.itemKey) parsePlanningKey(input.itemKey);
    const id = crypto.randomUUID();
    await this.db.insert(planningReviews).values({ id, kind: input.kind, periodStart: input.periodStart, periodEnd: input.periodEnd,
      itemKey: input.itemKey ?? null, snapshotJson: JSON.stringify(input.snapshot), decisionsJson: JSON.stringify(input.decisions), note: input.note.trim(), confirmedAt: Date.now(),
    }).run();
    return id;
  }
  async listReviews(): Promise<PlanningReview[]> { return this.db.select().from(planningReviews).orderBy(desc(planningReviews.confirmedAt)).limit(100).all(); }
}
