import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/db";
import { notes, tasks, goals, projects } from "../db/schema";
import { inboxLinks } from "../db/ganttSchema";
import { NoteRepository } from "../db/repositories/noteRepository";
import { parsePlanningKey } from "../db/repositories/planningRepository";
import { UndoManager, undoManager } from "../lib/undoManager";
import { bumpDataVersion } from "../lib/dataVersion";
import { isLocalDate } from "./taskSchedulingService";
import { todayString } from "../lib/date";

export type InboxDestination = { scheduledDate?: string; itemKey?: string; plannedStart?: number | null; plannedEnd?: number | null };
/** The INSERT and its triggers claim the source, create the task and persist its link
 * in one SQLite statement, including across the SQL plugin's pooled connections. */
export class InboxService {
  constructor(private readonly db: Db, private readonly history: UndoManager = undoManager) {}
  private changed() { for (const domain of ["note","task","goal","project"] as const) bumpDataVersion(domain); }
  async links() { return this.db.select().from(inboxLinks).all(); }
  async arrange(noteId: number, destination: InboxDestination = {}) {
    const source = await new NoteRepository(this.db).findById(noteId);
    if (!source || source.status !== "active") throw new Error("收集项已处理，请刷新列表");
    const date = destination.scheduledDate ?? todayString();
    if (date && !isLocalDate(date)) throw new Error("请选择有效日期");
    const from = destination.plannedStart ?? null, to = destination.plannedEnd ?? null;
    if ((from != null || to != null) && (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || to <= from)) throw new Error("请选择有效的时间块");
    let goalId: number | null = null, projectId: number | null = null;
    if (destination.itemKey) {
      const ref = parsePlanningKey(destination.itemKey);
      if (ref.kind === "plan") { const owner = await this.db.select().from(goals).where(eq(goals.id,ref.id)).get(); if (!owner) throw new Error("计划已不存在"); goalId = ref.id; }
      else { const owner = await this.db.select().from(projects).where(eq(projects.id,ref.id)).get(); if (!owner) throw new Error("项目已不存在"); projectId = ref.id; goalId = owner.goalId; }
    }
    const now = Date.now();
    const [task] = await this.db.insert(tasks).values({ title:source.title, categoryId:source.categoryId, scheduledDate:date, plannedStart:from, plannedEnd:to, goalId,projectId,sourceNoteId:noteId,createdAt:now,updatedAt:now }).returning().all();
    this.changed();
    const undo = async () => {
      // Refuse to remove work which has since acquired actual focus or children.
      const result = await this.db.values(sql`UPDATE notes SET status='active',completed_at=${source.completedAt},updated_at=${Date.now()}
        WHERE id=${noteId} AND status='arranged' AND EXISTS(SELECT 1 FROM inbox_links WHERE note_id=${noteId} AND (task_id=${task.id} OR task_id IS NULL)) RETURNING id`);
      if (!result.length) throw new Error("任务已有投入或子任务，请先撤销后续操作");
      this.changed();
    };
    const redo = async () => { await this.db.insert(tasks).values({ ...task, updatedAt:Date.now() }).run(); this.changed(); };
    if (!this.history.applying) this.history.push({ type:"inbox.arrange",label:"整理收集项为任务",undo,redo });
    return task;
  }
  async setStatus(noteId: number, status: "saved" | "completed") {
    const before = await new NoteRepository(this.db).findById(noteId);
    if (!before || before.status !== "active") throw new Error("收集项已处理，请刷新列表");
    const after = { status, completedAt:status === "completed" ? Date.now() : null };
    const [updated] = await this.db.update(notes).set({ ...after,updatedAt:Math.max(Date.now(),before.updatedAt+1) }).where(and(eq(notes.id,noteId),eq(notes.updatedAt,before.updatedAt),eq(notes.status,"active"))).returning().all();
    if (!updated) throw new Error("收集项已变化，未覆盖现有内容");
    const apply = async (value: typeof before) => { await this.db.update(notes).set({ status:value.status,completedAt:value.completedAt,updatedAt:Date.now() }).where(eq(notes.id,noteId)).run(); this.changed(); };
    if (!this.history.applying) this.history.push({ type:"inbox.status",label:status === "saved" ? "保存为笔记" : "归档收集项",undo:() => apply(before),redo:() => apply(updated) });
    this.changed();
  }
  async batch(noteIds: number[], target: InboxDestination | "saved" | "completed") {
    const results: { id:number; ok:boolean; error?:string }[] = [];
    await this.history.withBatchAsync(async () => { for (const id of [...new Set(noteIds)]) { try { if (typeof target === "string") await this.setStatus(id,target); else await this.arrange(id,target); results.push({ id,ok:true }); } catch (error) { results.push({ id,ok:false,error:error instanceof Error ? error.message : "处理失败" }); } } });
    return results;
  }
}
