import { expect, it, vi } from "vitest";
import { createFocusStore } from "./focusStore";
import { elapsedSeconds, type FocusRecord, type FocusResponse } from "./types";
const active: FocusRecord = { id: 1, taskId: 12, taskTitle: "任务", startedAt: 1000, endedAt: null, actualSeconds: 30, status: "running", runningSince: 1000, pausedAt: null, goalSeconds: 60, mode: "stopwatch", note: "", nextAction: "", interruptionCount: 0, source: "timer", checkpointAt: 1000, revision: 1 };
it("requests a switch without silently discarding the active session", async () => {
  const execute = vi.fn().mockResolvedValue({ active }); const store = createFocusStore(execute);
  await store.getState().sync(); await store.getState().start(24);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.getState().switchTaskId).toBe(24);
  await store.getState().confirmSwitch();
  expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ action: "switch", sessionId: 1, taskId: 24 }));
});
it("failed finish retains session and retries the same operation ID", async () => {
  const execute = vi.fn().mockResolvedValueOnce({ active }).mockRejectedValueOnce(new Error("数据库忙")).mockResolvedValueOnce({ active: null });
  const store = createFocusStore(execute); await store.getState().sync();
  expect(await store.getState().perform({ action: "finish", note: "保留备注" })).toBe(false);
  expect(store.getState().active?.id).toBe(1); expect(store.getState().error).toContain("数据库忙");
  await store.getState().retry(); expect(execute.mock.calls[2][0]).toEqual(execute.mock.calls[1][0]);
  expect(store.getState().active).toBeNull();
});
it("an old read cannot overwrite a newly started session", async () => {
  let resolve!: (value: FocusResponse) => void;
  const execute = vi.fn().mockImplementationOnce(() => new Promise<FocusResponse>((r) => { resolve = r; })).mockResolvedValueOnce({ active });
  const store = createFocusStore(execute); const read = store.getState().sync(); await store.getState().start(12);
  resolve({ active: null }); await read; expect(store.getState().active?.id).toBe(1);
});
it("running time may exceed goal; paused and recovery time never advances", () => {
  expect(elapsedSeconds(active, 91000)).toBe(120);
  expect(elapsedSeconds({ ...active, status: "paused" }, 91000)).toBe(30);
  expect(elapsedSeconds({ ...active, status: "recovery" }, 91000)).toBe(30);
});
it("remote session replacement closes the old finish panel and clears its drafts", async () => {
  const other = { ...active, id: 2, taskId: 24 };
  const execute = vi.fn().mockResolvedValueOnce({ active }).mockResolvedValueOnce({ active: { ...active, status: "paused" } }).mockResolvedValue({ active: other });
  const store = createFocusStore(execute);
  await store.getState().sync(); await store.getState().openFinish();
  store.getState().setDraft("noteDraft", "Only belongs to A");
  store.getState().setDraft("nextDraft", "A next action");
  await store.getState().start(30);
  await store.getState().sync();
  expect(store.getState()).toMatchObject({ active: other, finishOpen: false, finishWasRunning: false, noteDraft: "", nextDraft: "", switchTaskId: undefined });
  const calls = execute.mock.calls.length;
  await store.getState().closeFinish();
  expect(execute).toHaveBeenCalledTimes(calls);
});
it("finishing in another window cannot leave drafts ready for a future session", async () => {
  const execute = vi.fn().mockResolvedValueOnce({ active: { ...active, status: "paused" } }).mockResolvedValue({ active: null });
  const store = createFocusStore(execute); await store.getState().sync(); await store.getState().openFinish();
  store.getState().setDraft("noteDraft", "Only belongs to A"); await store.getState().sync();
  expect(store.getState()).toMatchObject({ finishOpen: false, noteDraft: "", nextDraft: "" });
});
it("checkpoint and revision refreshes for the same session preserve finish drafts", async () => {
  const paused = { ...active, status: "paused" as const };
  const execute = vi.fn().mockResolvedValueOnce({ active: paused }).mockResolvedValue({ active: { ...paused, revision: 2, checkpointAt: 5000 } });
  const store = createFocusStore(execute); await store.getState().sync(); await store.getState().openFinish();
  store.getState().setDraft("noteDraft", "Keep this"); await store.getState().sync();
  expect(store.getState()).toMatchObject({ finishOpen: true, noteDraft: "Keep this" });
});
it("an asynchronous pause result cannot open a finish panel for another session", async () => {
  let resolve!: (value: FocusResponse) => void;
  const execute = vi.fn().mockResolvedValueOnce({ active }).mockImplementationOnce(() => new Promise<FocusResponse>((r) => { resolve = r; }));
  const store = createFocusStore(execute); await store.getState().sync();
  const opening = store.getState().openFinish();
  resolve({ active: { ...active, id: 2, taskId: 24 } }); await opening;
  expect(store.getState().finishOpen).toBe(false);
});
