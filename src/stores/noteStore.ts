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

const noteService = new NoteService(new NoteRepository(getDb()));

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
    } catch {
      useAppStore.getState().pushToast("error", "删除便签失败");
    }
  },
}));
