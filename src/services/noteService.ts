import {
  NoteRepository,
  type Note,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "../db/repositories/noteRepository";
import { undoManager } from "../lib/undoManager";

/** 便签可撤销字段（排除派生 sortOrder）。 */
const NOTE_UNDOABLE_FIELDS = ["title", "categoryId", "status", "completedAt"] as const;

function diffNote(
  a: Pick<Note, (typeof NOTE_UNDOABLE_FIELDS)[number]> | null | undefined,
  b: Pick<Note, (typeof NOTE_UNDOABLE_FIELDS)[number]> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!a || !b) return out;
  for (const f of NOTE_UNDOABLE_FIELDS) {
    if (a[f] !== b[f]) out[f] = b[f];
  }
  return out;
}

/**
 * 便签业务逻辑。便签独立于日期持久存在：
 * 未删除/未完成则持续显示；完成保留历史数据（不物理删除）。
 * v1.6：创建/编辑/完成/删除接入 Undo/Redo（undo/redo 应用期间跳过入栈）。
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
    const note = await this.notes.create(input);
    if (!undoManager.applying) {
      const n = { ...note };
      undoManager.push({
        type: "note.create",
        label: "创建便签",
        undo: async () => {
          await this.notes.delete(n.id);
        },
        redo: async () => {
          await this.notes.insertRestored(n);
        },
      });
    }
    return note;
  }

  async update(id: number, input: UpdateNoteInput): Promise<Note | null> {
    const before = await this.notes.findById(id);
    const updated = await this.notes.update(id, input);
    if (updated && !undoManager.applying) {
      const a = { ...before } as Note;
      const b = { ...updated } as Note;
      const diff = diffNote(a, b);
      if (Object.keys(diff).length > 0) {
        undoManager.push({
          type: "note.update",
          label: "编辑便签",
          undo: async () => {
            await this.notes.update(id, diffNote(b, a));
          },
          redo: async () => {
            await this.notes.update(id, diffNote(a, b));
          },
        });
      }
    }
    return updated;
  }

  /** 完成便签（保留数据）。 */
  async complete(id: number): Promise<Note | null> {
    const before = await this.notes.findById(id);
    const done = await this.notes.complete(id);
    if (done && !undoManager.applying && before) {
      const a = { ...before } as Note;
      const b = { ...done } as Note;
      const diff = diffNote(a, b);
      if (Object.keys(diff).length > 0) {
        undoManager.push({
          type: "note.complete",
          label: "完成便签",
          undo: async () => {
            await this.notes.update(id, diffNote(b, a));
          },
          redo: async () => {
            await this.notes.update(id, diffNote(a, b));
          },
        });
      }
    }
    return done;
  }

  async delete(id: number): Promise<boolean> {
    const before = await this.notes.findById(id);
    const ok = await this.notes.delete(id);
    if (ok && before && !undoManager.applying) {
      const n = { ...before } as Note;
      undoManager.push({
        type: "note.delete",
        label: "删除便签",
        undo: async () => {
          await this.notes.insertRestored(n);
        },
        redo: async () => {
          await this.notes.delete(n.id);
        },
      });
    }
    return ok;
  }
}
