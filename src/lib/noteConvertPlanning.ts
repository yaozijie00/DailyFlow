import type { Db } from "../db/db";
import { NoteRepository } from "../db/repositories/noteRepository";
import { PlanningWorkspaceService } from "../services/planningWorkspaceService";
import { UndoManager, undoManager } from "./undoManager";

export type NotePlanningTarget = "plan" | "project" | "idea";
const pending = new WeakMap<Db, Set<number>>();

/** Retain the source in history. Capture target history privately so failed conversions
 * never leave a phantom action in the application's undo stack. */
export async function convertNoteToPlanning(
  db: Db, noteId: number, target: NotePlanningTarget, history: UndoManager = undoManager,
): Promise<string | null> {
  const busy = pending.get(db) ?? new Set<number>();
  pending.set(db, busy);
  if (busy.has(noteId)) return null;
  busy.add(noteId);
  try {
    const notes = new NoteRepository(db), source = await notes.findById(noteId);
    if (!source || source.status !== "active") return null;
    const targetHistory = new UndoManager();
    const workspace = new PlanningWorkspaceService(db, targetHistory);
    const key = await workspace.create(target === "project" ? "project" : "plan", source.title, target === "idea");
    let completed;
    try {
      completed = await notes.complete(noteId);
      if (!completed) throw new Error("收集项已不存在");
    } catch (error) {
      await targetHistory.undo();
      throw error;
    }
    const restoreSource = async () => {
      if (!await notes.update(noteId, { status: "active", completedAt: source.completedAt })) {
        await notes.insertRestored(source);
      }
    };
    const archiveSource = async () => {
      if (!await notes.update(noteId, { status: "completed", completedAt: completed.completedAt })) {
        await notes.insertRestored(completed);
      }
    };
    if (!history.applying) history.push({
      type: "note.convertPlanning", label: "转换收集项",
      undo: async () => {
        await restoreSource();
        try { await targetHistory.undo(); }
        catch (error) { await archiveSource(); throw error; }
      },
      redo: async () => {
        await targetHistory.redo();
        try { await archiveSource(); }
        catch (error) { await targetHistory.undo(); throw error; }
      },
    });
    return key;
  } finally { busy.delete(noteId); }
}
