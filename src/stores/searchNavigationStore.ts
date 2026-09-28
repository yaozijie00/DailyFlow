import { create } from "zustand";
type Request = { id: number; token: number };
let sequence = 0;
export const useSearchNavigationStore = create<{
  noteRequest: Request | null;
  goalRequest: Request | null;
  openNote: (id: number) => void;
  openGoal: (id: number) => void;
  clearNoteRequest: (token: number) => void;
  clearGoalRequest: (token: number) => void;
}>((set) => ({
  noteRequest: null, goalRequest: null,
  openNote: (id) => set({ noteRequest: { id, token: ++sequence } }),
  openGoal: (id) => set({ goalRequest: { id, token: ++sequence } }),
  clearNoteRequest: (token) => set((s) => s.noteRequest?.token === token ? { noteRequest: null } : {}),
  clearGoalRequest: (token) => set((s) => s.goalRequest?.token === token ? { goalRequest: null } : {}),
}));
