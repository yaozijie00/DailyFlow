import type { Db } from "../db/db";
import { NoteRepository } from "../db/repositories/noteRepository";
import { PlanningWorkspaceService } from "../services/planningWorkspaceService";
import { UndoManager, undoManager } from "./undoManager";
import { inboxLinks } from "../db/ganttSchema";
import { notes as noteTable } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { bumpDataVersion } from "./dataVersion";

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
    const link = { noteId,taskId:null,itemKey:key,processedAt:Date.now() };
    try {
      // Claim the source before archiving; UNIQUE(note_id) also guards other windows.
      await db.insert(inboxLinks).values(link).run();
      const [claimed] = await db.update(noteTable).set({ status:"completed",completedAt:link.processedAt,updatedAt:link.processedAt }).where(and(eq(noteTable.id,noteId),eq(noteTable.status,"active"),eq(noteTable.updatedAt,source.updatedAt))).returning().all();
      if (!claimed) throw new Error("收集项已被修改，请重试");
      completed = await notes.complete(noteId);
      if (!completed) throw new Error("收集项已不存在");
    } catch (error) {
      await db.delete(inboxLinks).where(and(eq(inboxLinks.noteId,noteId),eq(inboxLinks.itemKey,key))).run();
      const latest=await notes.findById(noteId);
      if (latest?.status==="completed" && latest.updatedAt===link.processedAt) await notes.update(noteId,{ status:"active",completedAt:source.completedAt });
      await targetHistory.undo();
      throw error;
    }
    const restoreSource = async () => {
      await db.delete(inboxLinks).where(eq(inboxLinks.noteId,noteId)).run();
      if (!await notes.update(noteId, { status: "active", completedAt: source.completedAt })) {
        await notes.insertRestored(source);
      }
      bumpDataVersion("note");
    };
    const archiveSource = async () => {
      await db.insert(inboxLinks).values(link).onConflictDoNothing().run();
      if (!await notes.update(noteId, { status: "completed", completedAt: completed.completedAt })) {
        await notes.insertRestored(completed);
      }
      bumpDataVersion("note");
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
    bumpDataVersion("note");
    return key;
  } finally { busy.delete(noteId); }
}
