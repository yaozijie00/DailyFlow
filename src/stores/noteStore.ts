import { create } from "zustand";
import { getDb } from "../db/db";
import {
  NoteRepository,
  type Note,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "../db/repositories/noteRepository";
import { NoteService } from "../services/noteService";
import { useAppStore } from "./appStore";
import { undoManager } from "../lib/undoManager";

const noteService = new NoteService(new NoteRepository(getDb()));

/** 共享便签服务单例（命令面板搜索等只读查询复用）。 */
export { noteService };

interface NoteState {
  /** 未完成便签（active + arranged） */
  notes: Note[];
  /** 已完成便签（历史） */
  completedNotes: Note[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: CreateNoteInput) => Promise<void>;
  update: (id: number, input: UpdateNoteInput) => Promise<void>;
  complete: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** 一键清理全部「已安排」便签（批量、一次撤销） */
  clearArranged: () => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  completedNotes: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const [notes, completedNotes] = await Promise.all([
        noteService.listActive(),
        noteService.listCompleted(),
      ]);
      set({ notes, completedNotes, loading: false });
    } catch {
      set({ loading: false });
      useAppStore.getState().pushToast("error", "加载便签失败");
    }
  },

  create: async (input) => {
    try {
      await noteService.create(input);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "创建便签失败");
    }
  },

  update: async (id, input) => {
    try {
      await noteService.update(id, input);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "保存便签失败");
    }
  },

  complete: async (id) => {
    try {
      await noteService.complete(id);
      await get().load();
    } catch {
      useAppStore.getState().pushToast("error", "完成便签失败");
    }
  },

  remove: async (id) => {
    try {
      await noteService.delete(id);
      await get().load();
      useAppStore.getState().pushToast("success", "便签已删除", {
        label: "撤销",
        onClick: () => {
          void (async () => {
            try {
              await undoManager.undo();
              await get().load();
            } catch {
              useAppStore.getState().pushToast("error", "撤销失败，数据没有改变，请重试");
            }
          })();
        },
      });
    } catch {
      useAppStore.getState().pushToast("error", "删除便签失败");
    }
  },

  clearArranged: async () => {
    const arrangedIds = get().notes.filter((n) => n.status === "arranged").map((n) => n.id);
    if (arrangedIds.length === 0) return;
    try {
      // 一次批量 Undo：全部清理 = 一个撤销动作
      await undoManager.withBatchAsync(async () => {
        for (const id of arrangedIds) {
          await noteService.delete(id);
        }
      });
      await get().load();
      useAppStore
        .getState()
        .pushToast("success", `已清理 ${arrangedIds.length} 条已安排便签（可撤销）`);
    } catch {
      useAppStore.getState().pushToast("error", "清理已安排便签失败");
    }
  },
}));
