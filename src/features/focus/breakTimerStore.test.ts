import { expect, it } from "vitest";
import { createBreakTimerStore } from "./breakTimerStore";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
it("restores a rest deadline after navigation/restart and finishes it only once", () => {
  const saved = storage(), first = createBreakTimerStore(saved);
  first.getState().start(5, 1000);
  const restarted = createBreakTimerStore(saved);
  expect(restarted.getState().until).toBe(301000);
  expect(restarted.getState().minutes).toBe(5);
  expect(restarted.getState().finishIfDue(300999)).toBe(false);
  expect(restarted.getState().finishIfDue(301000)).toBe(true);
  expect(restarted.getState().finishIfDue(302000)).toBe(false);
  expect(createBreakTimerStore(saved).getState().until).toBeNull();
});
it("cancels durably and rejects invalid durations", () => {
  const saved = storage(), store = createBreakTimerStore(saved);
  for (const value of [NaN, Infinity, 0, 61]) store.getState().start(value, 1000);
  expect(store.getState().until).toBeNull();
  store.getState().start(2, 1000); store.getState().cancel();
  expect(createBreakTimerStore(saved).getState().until).toBeNull();
});
