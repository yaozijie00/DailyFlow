import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { notes } from "../schema";

export type Note = typeof notes.$inferSelect;

export type NoteStatus = "active" | "arranged" | "completed";

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
      .where(inArray(notes.status, ["active", "arranged"]))
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
}
