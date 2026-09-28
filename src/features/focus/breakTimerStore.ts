import { create } from "zustand";

type BreakStorage = Pick<Storage, "getItem" | "setItem">;
interface BreakState {
  minutes: number;
  until: number | null;
  start: (minutes: number, now?: number) => void;
  cancel: () => void;
  finishIfDue: (now?: number) => boolean;
}
const key = "dailyflow.focus.break.v1";
export function createBreakTimerStore(storage?: BreakStorage) {
  let initial = { minutes: 5, until: null as number | null };
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    if (saved && Number.isFinite(saved.minutes) && saved.minutes >= 1 && saved.minutes <= 60 && (saved.until === null || Number.isFinite(saved.until))) initial = { minutes: saved.minutes, until: saved.until };
  } catch { /* A corrupt auxiliary preference must not block focus. */ }
  const persist = (value: typeof initial) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Keep the in-memory timer available. */ } };
  return create<BreakState>((set, get) => ({
    ...initial,
    start: (minutes, now = Date.now()) => {
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) return;
      const value = { minutes, until: now + minutes * 60000 }; persist(value); set(value);
    },
    cancel: () => { const value = { minutes: get().minutes, until: null }; persist(value); set(value); },
    finishIfDue: (now = Date.now()) => {
      const until = get().until;
      if (until === null || now < until) return false;
      get().cancel(); return true;
    },
  }));
}
function localStorageIfAvailable() { try { return globalThis.localStorage; } catch { return undefined; } }
export const useBreakTimerStore = createBreakTimerStore(localStorageIfAvailable());
