import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusService } from "./focusService";

describe("FocusService（专注持久化）", () => {
  let db: Db;
  let close: () => void;
  let sessions: FocusSessionRepository;
  let settings: SettingsRepository;
  let tasks: TaskRepository;
  let service: FocusService;
  let clock: { now: () => number; advance: (ms: number) => void };

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    sessions = new FocusSessionRepository(db);
    settings = new SettingsRepository(db);
    tasks = new TaskRepository(db);
    let now = 1_000_000;
    clock = {
      now: () => now,
      advance: (ms: number) => {
        now += ms;
      },
    };
    service = new FocusService(sessions, settings, tasks, clock.now);
  });

  afterEach(() => close());

  async function makeTask() {
    return tasks.create({ title: "A", scheduledDate: "2026-08-27" });
  }

  it("start 写入进行中会话（ended_at=null）+ active_focus", async () => {
    const task = await makeTask();
    const s = await service.start(task.id, 1500);
    expect(s.endedAt).toBeNull();
    expect(s.plannedDuration).toBe(1500);
    expect(s.taskId).toBe(task.id);
    expect(await service.getActiveState()).toEqual({
      sessionId: s.id,
      pausedAt: null,
      accumulatedPauseMs: 0,
    });
  });

  it("pause 记录 pausedAt；resume 累计暂停时长", async () => {
    const task = await makeTask();
    await service.start(task.id, 1500);
    clock.advance(5 * 60_000);
    await service.pause();
    clock.advance(3 * 60_000);
    await service.resume();
    const active = await service.getActiveState();
    expect(active?.pausedAt).toBeNull();
    expect(active?.accumulatedPauseMs).toBe(3 * 60_000);
  });

  it("finish(completed=true) 回填会话、累加任务实际时长、清空 active_focus", async () => {
    const task = await makeTask();
    const s = await service.start(task.id, 1500);
    await service.finish(true, 1500);
    const closed = await sessions.findById(s.id);
    expect(closed?.endedAt).not.toBeNull();
    expect(closed?.completed).toBe(true);
    expect(closed?.actualDuration).toBe(1500);
    const t2 = await tasks.findById(task.id);
    expect(t2?.actualDuration).toBe(1500);
    expect(await service.getActiveState()).toBeNull();
  });

  it("finish(completed=false)（提前结束）记录实际投入", async () => {
    const task = await makeTask();
    const s = await service.start(task.id, 1500);
    await service.finish(false, 600);
    const closed = await sessions.findById(s.id);
    expect(closed?.completed).toBe(false);
    expect(closed?.actualDuration).toBe(600);
    const t2 = await tasks.findById(task.id);
    expect(t2?.actualDuration).toBe(600);
  });

  it("getActiveForRestore：进行中会话返回重建上下文，结束后返回 null", async () => {
    const task = await makeTask();
    const s = await service.start(task.id, 1500);
    clock.advance(5 * 60_000);
    await service.pause();
    const r = await service.getActiveForRestore();
    expect(r?.session.id).toBe(s.id);
    expect(r?.pausedAt).not.toBeNull();
    await service.finish(false, 300);
    expect(await service.getActiveForRestore()).toBeNull();
  });

  it("孤儿 active_focus（无进行中会话）恢复时返回 null 并清理", async () => {
    await settings.set(
      "active_focus",
      JSON.stringify({ sessionId: 999, pausedAt: null, accumulatedPauseMs: 0 }),
    );
    expect(await service.getActiveForRestore()).toBeNull();
    expect(await settings.get("active_focus")).toBeNull();
  });
});
