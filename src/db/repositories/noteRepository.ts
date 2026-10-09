import { and, desc, eq, inArray, like } from "drizzle-orm";
import type { Db } from "../db";
import { notes, tasks } from "../schema";
import { inboxLinks, taskPlanningRanges } from "../ganttSchema";

export type Note = typeof notes.$inferSelect;

export type NoteStatus = "active" | "saved" | "arranged" | "completed";

export interface CreateNoteInput {
  title: string;
  categoryId?: number | null;
  status?: NoteStatus;
}

export type UpdateNoteInput = Partial<CreateNoteInput> & {
  sortOrder?: number;
  completedAt?: number | null;
};

export class NoteRepository {
  constructor(private readonly db: Db) {}
  async sourceLink(id:number) { return (await this.db.select().from(inboxLinks).where(eq(inboxLinks.noteId,id)).get()) ?? null; }
  async restoreSourceLink(link: typeof inboxLinks.$inferSelect | null) { if (link) await this.db.insert(inboxLinks).values(link).onConflictDoNothing().run(); }
  async conversionSnapshot(id:number) {
    const link=await this.sourceLink(id);
    const task=link?.taskId == null ? null : (await this.db.select().from(tasks).where(eq(tasks.id,link.taskId)).get()) ?? null;
    const range=task ? (await this.db.select().from(taskPlanningRanges).where(eq(taskPlanningRanges.taskId,task.id)).get()) ?? null : null;
    return { link,task,range };
  }
  async restoreConversion(snapshot: Awaited<ReturnType<NoteRepository["conversionSnapshot"]>>) {
    if (!snapshot.task || !snapshot.link) { await this.restoreSourceLink(snapshot.link); return; }
    await this.db.insert(tasks).values({ ...snapshot.task,sourceNoteId:snapshot.link.noteId }).run();
    try {
      if (snapshot.range) await this.db.insert(taskPlanningRanges).values(snapshot.range).run();
      await this.db.update(inboxLinks).set(snapshot.link).where(eq(inboxLinks.noteId,snapshot.link.noteId)).run();
    } catch (error) { await this.update(snapshot.link.noteId,{ status:"active" }); throw error; }
  }

  async create(input: CreateNoteInput): Promise<Note> {
    const now = Date.now();
    const rows = await this.db
      .insert(notes)
      .values({
        title: input.title,
        categoryId: input.categoryId ?? null,
        status: input.status ?? "active",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })
      .returning()
      .all();
    return rows[0];
  }

  async findById(id: number): Promise<Note | null> {
    const row = await this.db
      .select()
      .from(notes)
      .where(eq(notes.id, id))
      .get();
    return row ?? null;
  }

  /** 全部便签（按 sort_order + id）。 */
  async findAll(): Promise<Note[]> {
    return this.db.select().from(notes).orderBy(notes.sortOrder, notes.id).all();
  }

  /** 未完成便签（active + arranged），供默认视图（含折叠显示）。 */
  async listActive(): Promise<Note[]> {
    return this.db
      .select()
      .from(notes)
      .where(inArray(notes.status, ["active", "saved", "arranged"]))
      .orderBy(notes.sortOrder, notes.id)
      .all();
  }

  /** 已完成便签（可查看历史）。 */
  async listCompleted(): Promise<Note[]> {
    return this.db
      .select()
      .from(notes)
      .where(eq(notes.status, "completed"))
      .orderBy(notes.completedAt, notes.id)
      .all();
  }

  async update(id: number, input: UpdateNoteInput): Promise<Note | null> {
    const rows = await this.db
      .update(notes)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(notes.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  /** 完成便签（保留数据，不删除；重复完成幂等）。 */
  async complete(id: number): Promise<Note | null> {
    const rows = await this.db
      .update(notes)
      .set({ status: "completed", completedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(notes.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  /** 物理删除。 */
  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(notes)
      .where(eq(notes.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /** 以原 id 重建便签（撤销「删除便签」用）。 */
  async insertRestored(note: Note): Promise<void> {
    await this.db.insert(notes).values(note).run();
  }

  /** 标题模糊搜索（未完成便签，命令面板用）。 */
  async searchActiveByTitle(query: string, limit = 10): Promise<Note[]> {
    const q = `%${query.trim()}%`;
    return this.db
      .select()
      .from(notes)
      .where(and(inArray(notes.status, ["active", "saved", "arranged"]), like(notes.title, q)))
      .orderBy(desc(notes.id))
      .limit(limit)
      .all();
  }
}
