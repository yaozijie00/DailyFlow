import { getDb } from "../db/db";
import { InboxService, type InboxDestination } from "../services/inboxService";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore } from "../stores/taskStore";
import { useAppStore } from "../stores/appStore";

export async function arrangeInbox(noteId: number, destination: InboxDestination = {}) {
  try { await new InboxService(getDb()).arrange(noteId,destination); await Promise.all([useNoteStore.getState().load(),useTaskStore.getState().load()]); return true; }
  catch (error) { useAppStore.getState().pushToast("error",error instanceof Error ? error.message : "整理失败，原文已保留"); return false; }
}
