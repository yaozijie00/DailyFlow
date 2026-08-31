import {
  NoteRepository,
  type Note,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "../db/repositories/noteRepository";

/**
 * 便签业务逻辑。便签独立于日期持久存在：
 * 未删除/未完成则持续显示；完成保留历史数据（不物理删除）。
 */
export class NoteService {
  constructor(private readonly notes: NoteRepository) {}

  /** 未完成便签（active + arranged），供默认视图。 */
  async listActive(): Promise<Note[]> {
    return this.notes.listActive();
  }

  /** 已完成便签（可查看历史）。 */
  async listCompleted(): Promise<Note[]> {
    return this.notes.listCompleted();
  }

  async create(input: CreateNoteInput): Promise<Note> {
    return this.notes.create(input);
  }

  async update(id: number, input: UpdateNoteInput): Promise<Note | null> {
    return this.notes.update(id, input);
  }

  /** 完成便签（保留数据）。 */
  async complete(id: number): Promise<Note | null> {
    return this.notes.complete(id);
  }

  async delete(id: number): Promise<boolean> {
    return this.notes.delete(id);
  }
}
