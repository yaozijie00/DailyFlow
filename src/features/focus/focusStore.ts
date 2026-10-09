import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { bumpDataVersion } from "../../lib/dataVersion";
import type { FocusMode, FocusRecord, FocusRequest, FocusResponse } from "./types";

interface FocusState {
  active: FocusRecord | null; busy: boolean; error: string; focusVersion: number;
  switchTaskId: number | null | undefined; switchMode: FocusMode; switchGoal: number | null; switchIntention?: string;
  finishOpen: boolean; finishWasRunning: boolean; noteDraft: string; nextDraft: string;
  failedRequest: FocusRequest | null; lastFinished: FocusRecord | null;
  sync: () => Promise<void>; perform: (request: FocusRequest) => Promise<boolean>; retry: () => Promise<boolean>;
  start: (taskId: number | null, mode?: FocusMode, goalSeconds?: number | null, intention?: string) => Promise<boolean>;
  confirmSwitch: () => Promise<boolean>; cancelSwitch: () => void;
  openFinish: () => Promise<void>; closeFinish: () => Promise<void>;
  setDraft: (field: "noteDraft" | "nextDraft", value: string) => void;
}
export const executeFocus = (request: FocusRequest) => invoke<FocusResponse>("focus_execute", { request });
/** Session-scoped UI must never follow another window's replacement session. */
function applyActive(previous: FocusRecord | null, active: FocusRecord | null): Partial<FocusState> {
  return {
    active,
    ...(previous?.id !== active?.id ? {
      finishOpen: false, finishWasRunning: false, noteDraft: "", nextDraft: "",
      switchTaskId: undefined, switchIntention: undefined, switchMode: "stopwatch" as const, switchGoal: null,
    } : {}),
  };
}
export function createFocusStore(execute = executeFocus) {
  let generation = 0;
  return create<FocusState>((set, get) => ({
    active: null, busy: false, error: "", focusVersion: 0, switchTaskId: undefined,
    switchMode: "stopwatch", switchGoal: null, finishOpen: false, finishWasRunning: false,
    noteDraft: "", nextDraft: "", failedRequest: null, lastFinished: null,
    sync: async () => {
      if (get().busy) return;
      const ticket = ++generation;
      try {
        const response = await execute({ action: "read" });
        if (ticket === generation && !get().busy) set((s) => applyActive(s.active, response.active));
      } catch (reason) {
        if (ticket === generation) set({ error: String(reason instanceof Error ? reason.message : reason) });
      }
    },
    perform: async (input) => {
      if (get().busy) return false;
      ++generation;
      const previous = get().active;
      const request = { sessionId: previous?.id, expectedVersion: previous?.revision, operationId: crypto.randomUUID(), ...input };
      set({ busy: true, error: "" });
      try {
        const response = await execute(request);
        set((s) => ({ ...applyActive(s.active, response.active), busy: false, failedRequest: null, focusVersion: s.focusVersion + 1,
          ...(input.action === "finish" ? { finishOpen: false, lastFinished: previous, noteDraft: "", nextDraft: "" } : {}),
          ...(input.action === "switch" ? { switchTaskId: undefined, noteDraft: "", nextDraft: "" } : {}),
        }));
        bumpDataVersion("focus"); bumpDataVersion("task");
        return true;
      } catch (reason) {
        set({ busy: false, error: String(reason instanceof Error ? reason.message : reason), failedRequest: request });
        return false;
      }
    },
    retry: async () => {
      const request = get().failedRequest;
      return request ? get().perform(request) : false;
    },
    start: async (taskId, mode = "stopwatch", goalSeconds = null, intention) => {
      if (get().active) {
        if (get().active?.taskId === taskId) return false;
        set({ switchTaskId: taskId, switchMode: mode, switchGoal: goalSeconds, switchIntention: intention }); return false;
      }
      return get().perform({ action: "start", taskId, mode, goalSeconds, ...(intention ? { intention } : {}) });
    },
    confirmSwitch: () => get().switchTaskId === undefined ? Promise.resolve(false) : get().perform({ action: "switch", taskId: get().switchTaskId, mode: get().switchMode, goalSeconds: get().switchGoal, intention: get().switchIntention, note: get().noteDraft, nextAction: get().nextDraft }),
    cancelSwitch: () => set({ switchTaskId: undefined, switchIntention: undefined }),
    openFinish: async () => {
      const current = get().active;
      if (!current || current.status === "recovery" || get().busy || get().finishOpen) return;
      if (current.status === "running" && !await get().perform({ action: "pause" })) return;
      if (get().active?.id !== current.id || get().active?.status !== "paused") return;
      set({ finishOpen: true, finishWasRunning: current.status === "running" });
    },
    closeFinish: async () => {
      if (get().busy || !get().finishOpen) return;
      if (get().finishWasRunning && !await get().perform({ action: "resume" })) return;
      set({ finishOpen: false });
    },
    setDraft: (field, value) => set({ [field]: value }),
  }));
}
export const useFocusStore = createFocusStore();
