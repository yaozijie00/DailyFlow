// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FocusWorkspace, { HistoryEditor, BreakTimer } from "./FocusWorkspace";
import { useBreakTimerStore } from "./breakTimerStore";
import type { FocusRecord } from "./types";

const mocks = vi.hoisted(() => ({ perform: vi.fn(), overlaps: vi.fn(), start: vi.fn(), active: null as FocusRecord | null, rows: [] as { id: number; title: string; scheduledDate: string; estimatedDuration: number }[] }));
vi.mock("../../db/db", () => ({ getDb: () => { const query = { select: () => query, from: () => query, where: () => query, orderBy: () => query, limit: () => query, all: async () => mocks.rows }; return query; } }));
vi.mock("../../stores/settingsStore", () => ({ useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { shortBreakMinutes: 8, pomodoroDurationMinutes: 40 } }) }));
vi.mock("../../db/repositories/taskRepository", () => ({ TaskRepository: class { searchByTitle = async () => []; } }));
vi.mock("../../stores/taskStore", () => ({ taskService: {} }));
vi.mock("./focusStore", () => {
  const state = { get active() { return mocks.active; }, busy: false, noteDraft: "", lastFinished: null, focusVersion: 0, perform: mocks.perform, start: mocks.start, error: "保存失败" };
  return { executeFocus: vi.fn().mockResolvedValue({ sessions: [] }), useFocusStore: Object.assign((select: (state: unknown) => unknown) => select(state), { getState: () => state }) };
});
vi.mock("./FocusController", () => ({ FocusClock: () => null, FocusControls: () => null, FocusError: () => null, FocusRecovery: () => null, StartFocusButton: () => null }));
vi.mock("./historyEditor", async (load) => ({ ...await load<typeof import("./historyEditor")>(), findFocusOverlaps: mocks.overlaps }));
const row: FocusRecord = { id: 4, taskId: null, taskTitle: "设计", startedAt: new Date(2026, 8, 19, 10, 0, 37, 125).getTime(), endedAt: 0, actualSeconds: 91.875, status: "finished", runningSince: null, pausedAt: null, goalSeconds: null, mode: "stopwatch", note: "", nextAction: "", interruptionCount: 0, source: "timer", checkpointAt: 0, revision: 3 };
beforeEach(() => { mocks.active = null; mocks.rows = []; mocks.perform.mockReset().mockResolvedValue(true); mocks.overlaps.mockReset().mockResolvedValue([]); mocks.start.mockReset().mockResolvedValue(true); useBreakTimerStore.getState().cancel(); });
afterEach(cleanup);

it("gives the recommended task one primary start without duplicating it in the list", async () => {
  mocks.rows = [{ id: 10, title: "完成蓝图通信", scheduledDate: "", estimatedDuration: 5400 }];
  render(<FocusWorkspace />);
  await screen.findByRole("heading", { name: "完成蓝图通信" });
  expect(screen.getAllByText("完成蓝图通信")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(10, "stopwatch", null));
});

it("paused state separates session context from mode setup and explains excluded time", () => {
  mocks.active = { ...row, status: "paused", pausedAt: Date.now() };
  render(<FocusWorkspace />);
  expect(screen.getByRole("heading", { name: "设计" })).toBeTruthy();
  expect(screen.getByText(/暂停期间不计时/)).toBeTruthy();
  expect(screen.queryByLabelText("计时模式")).toBeNull();
  expect(screen.getByRole("region", { name: "任务上下文" })).toBeTruthy();
});

it("a note-only save sends no rounded timing fields or overlap query", async () => {
  render(<HistoryEditor session={row} onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "保留原始投入" } });
  fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
  await waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(1));
  const request = mocks.perform.mock.calls[0][0];
  expect(request.note).toBe("保留原始投入");
  expect(request).not.toHaveProperty("startedAt");
  expect(request).not.toHaveProperty("durationSeconds");
  expect(mocks.overlaps).not.toHaveBeenCalled();
});

it("blocks an overlapping time correction until explicitly confirmed and rechecks before saving", async () => {
  mocks.overlaps.mockResolvedValue([{ id: 8, title: "重叠任务" }]);
  render(<HistoryEditor session={row} onClose={() => {}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText("投入分钟"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
  await screen.findByText(/这段时间与 1 条投入记录重叠/);
  expect(mocks.perform).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
  await waitFor(() => expect(mocks.perform).toHaveBeenCalledTimes(1));
  expect(mocks.overlaps).toHaveBeenCalledTimes(2);
  expect(mocks.overlaps).toHaveBeenLastCalledWith(expect.anything(), row.startedAt, row.startedAt + 180000, row.id);
  expect(mocks.perform.mock.calls[0][0]).toMatchObject({ durationSeconds: 180 });
  expect(mocks.perform.mock.calls[0][0]).not.toHaveProperty("startedAt");
});

it("a new overlap discovered at confirmation requires fresh consent", async () => {
  mocks.overlaps.mockResolvedValueOnce([{ id: 8, title: "重叠任务" }]).mockResolvedValue([{ id: 9, title: "刚保存的任务" }]);
  render(<HistoryEditor session="manual" onClose={() => {}} onSaved={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
  await screen.findByText(/重叠任务/);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "保存记录" }));
  await screen.findByText(/刚保存的任务/);
  expect(mocks.perform).not.toHaveBeenCalled();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});

it("keeps an auxiliary rest countdown after the page unmounts", () => {
  const first = render(<BreakTimer />);
  fireEvent.click(screen.getByRole("button", { name: "开始休息" }));
  const deadline = useBreakTimerStore.getState().until;
  first.unmount();
  render(<BreakTimer />);
  expect(screen.getByText(/休息中/)).toBeTruthy();
  expect(useBreakTimerStore.getState().until).toBe(deadline);
  expect(mocks.perform).not.toHaveBeenCalled();
});

it("uses configured short breaks and pomodoro goals and disables invalid starts", async () => {
  const rest = render(<BreakTimer />);
  expect((screen.getByLabelText("休息分钟") as HTMLInputElement).value).toBe("8");
  rest.unmount();
  render(<FocusWorkspace />);
  fireEvent.change(screen.getByLabelText("计时模式"), { target: { value: "pomodoro" } });
  expect((screen.getByLabelText("本次目标（分钟）") as HTMLInputElement).value).toBe("40");
  fireEvent.change(screen.getByLabelText("本次目标（分钟）"), { target: { value: "0" } });
  const start = screen.getByRole("button", { name: "开始无关联专注" }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  fireEvent.click(start);
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("本次目标（分钟）"), { target: { value: "40" } });
  fireEvent.click(start);
  await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(null, "pomodoro", 2400));
});
