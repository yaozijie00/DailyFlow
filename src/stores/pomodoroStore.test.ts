import { describe, it, expect, vi } from "vitest";
import { createPomodoroStore } from "./pomodoroStore";
import type { FocusService } from "../services/focusService";

const MINUTE = 60_000;

function makeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

interface FakeFocus {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
  getActiveForRestore: ReturnType<typeof vi.fn>;
}

function makeStore() {
  const clock = makeClock();
  const focus: FakeFocus = {
    start: vi.fn().mockResolvedValue({ id: 1 }),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
    getActiveForRestore: vi.fn().mockResolvedValue(null),
  };
  const store = createPomodoroStore(clock.now, focus as unknown as FocusService);
  return { store, clock, focus };
}

describe("PomodoroStore 初始状态", () => {
  it("初始 IDLE、25 分钟、无任务、不显示结果", () => {
    const { store } = makeStore();
    const s = store.getState();
    expect(s.snapshot.state).toBe("IDLE");
    expect(s.snapshot.remainingMs).toBe(25 * MINUTE);
    expect(s.taskId).toBeNull();
    expect(s.showResult).toBe(false);
  });
});

describe("startFocus", () => {
  it("开始专注：进入 RUNNING、记录任务", () => {
    const { store } = makeStore();
    store.getState().startFocus(7);
    const s = store.getState();
    expect(s.snapshot.state).toBe("RUNNING");
    expect(s.taskId).toBe(7);
    expect(s.showResult).toBe(false);
  });

  it("支持自定义时长（轮询 refresh 后读取最新快照）", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7, 10 * MINUTE);
    clock.advance(5 * MINUTE);
    store.getState().refresh(); // 模拟 UI 每秒轮询
    expect(store.getState().snapshot.remainingMs).toBe(5 * MINUTE);
  });
});

describe("pause / resume", () => {
  it("pause 后时间冻结", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(5 * MINUTE);
    store.getState().pause();
    expect(store.getState().snapshot.state).toBe("PAUSED");
    clock.advance(10 * MINUTE);
    expect(store.getState().snapshot.elapsedMs).toBe(5 * MINUTE);
  });

  it("resume 后暂停时长计入 totalPausedDuration", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(5 * MINUTE);
    store.getState().pause();
    clock.advance(3 * MINUTE);
    store.getState().resume();
    expect(store.getState().snapshot.state).toBe("RUNNING");
    expect(store.getState().snapshot.totalPausedDurationMs).toBe(3 * MINUTE);
    clock.advance(2 * MINUTE);
    store.getState().refresh(); // 模拟 UI 每秒轮询
    expect(store.getState().snapshot.elapsedMs).toBe(7 * MINUTE);
  });
});

describe("endFocus（结束）", () => {
  it("结束专注：COMPLETED 并显示结果（暂停时长被扣减）", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(10 * MINUTE);
    store.getState().pause();
    clock.advance(2 * MINUTE);
    store.getState().resume();
    clock.advance(5 * MINUTE);
    store.getState().endFocus();
    const s = store.getState();
    expect(s.snapshot.state).toBe("COMPLETED");
    expect(s.showResult).toBe(true);
    expect(s.snapshot.elapsedMs).toBe(15 * MINUTE); // 10+5 运行，2 暂停不计
  });
});

describe("refresh（UI 轮询刷新）", () => {
  it("运行中 refresh 不弹结果", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(5 * MINUTE);
    store.getState().refresh();
    expect(store.getState().showResult).toBe(false);
    expect(store.getState().snapshot.remainingMs).toBe(20 * MINUTE);
  });

  it("时间耗尽后 refresh 自动显示结果（无需点击结束）", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(25 * MINUTE);
    store.getState().refresh();
    const s = store.getState();
    expect(s.snapshot.state).toBe("COMPLETED");
    expect(s.showResult).toBe(true);
    expect(s.snapshot.remainingMs).toBe(0);
  });
});

describe("continueFocus / reset", () => {
  it("继续专注：同一任务重新开始", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(25 * MINUTE);
    store.getState().refresh(); // 自动完成
    store.getState().continueFocus();
    const s = store.getState();
    expect(s.snapshot.state).toBe("RUNNING");
    expect(s.showResult).toBe(false);
    expect(s.taskId).toBe(7);
    expect(s.snapshot.elapsedMs).toBe(0);
  });

  it("reset：回到初始 IDLE", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(3 * MINUTE);
    store.getState().endFocus();
    store.getState().reset();
    const s = store.getState();
    expect(s.snapshot.state).toBe("IDLE");
    expect(s.taskId).toBeNull();
    expect(s.showResult).toBe(false);
    expect(s.snapshot.remainingMs).toBe(25 * MINUTE);
  });
});

describe("专注持久化（B2/B9）", () => {
  it("startFocus 调用 focus.start 并记录 sessionId", async () => {
    const { store, focus } = makeStore();
    store.getState().startFocus(7);
    expect(focus.start).toHaveBeenCalledWith(7, 25 * 60); // 1500 秒
    await vi.waitFor(() => expect(store.getState().sessionId).toBe(1));
  });

  it("pause / resume 转发到 focus 服务", () => {
    const { store, focus, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(5 * MINUTE);
    store.getState().pause();
    expect(focus.pause).toHaveBeenCalled();
    store.getState().resume();
    expect(focus.resume).toHaveBeenCalled();
  });

  it("endFocus 调用 focus.finish（走满 completed=true）", async () => {
    const { store, focus, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(25 * MINUTE);
    store.getState().refresh(); // 自动完成
    store.getState().endFocus();
    expect(focus.finish).toHaveBeenCalledWith(true, 25 * 60);
  });

  it("提前结束 completed=false 并记录实际时长", () => {
    const { store, focus, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(10 * MINUTE);
    store.getState().endFocus();
    expect(focus.finish).toHaveBeenCalledWith(false, 10 * 60);
  });

  it("restoreActiveFocus 用持久化上下文重建计时器", async () => {
    const { store, clock, focus } = makeStore();
    focus.getActiveForRestore.mockResolvedValue({
      session: {
        id: 42,
        taskId: 7,
        plannedDuration: 1500,
        startedAt: 0,
      },
      pausedAt: null,
      accumulatedPauseMs: 0,
    });
    await store.getState().restoreActiveFocus();
    const s = store.getState();
    expect(s.taskId).toBe(7);
    expect(s.sessionId).toBe(42);
    expect(s.snapshot.state).toBe("RUNNING");
    expect(s.snapshot.durationMs).toBe(25 * MINUTE);
    clock.advance(5 * MINUTE);
    store.getState().refresh();
    expect(store.getState().snapshot.elapsedMs).toBe(5 * MINUTE);
  });
});

describe("竞态守卫（B7：非法转换不再抛错）", () => {
  it("RUNNING 下重复 startFocus 为 no-op", () => {
    const { store } = makeStore();
    store.getState().startFocus(7);
    expect(() => store.getState().startFocus(8)).not.toThrow();
    expect(store.getState().taskId).toBe(7); // 保持原任务
  });

  it("IDLE 下 pause/resume/endFocus 为 no-op", () => {
    const { store } = makeStore();
    expect(() => store.getState().pause()).not.toThrow();
    expect(() => store.getState().resume()).not.toThrow();
    expect(() => store.getState().endFocus()).not.toThrow();
    expect(store.getState().snapshot.state).toBe("IDLE");
  });

  it("时间耗尽瞬间 endFocus 不抛错", () => {
    const { store, clock } = makeStore();
    store.getState().startFocus(7);
    clock.advance(26 * MINUTE);
    expect(() => store.getState().endFocus()).not.toThrow();
    expect(store.getState().showResult).toBe(true);
  });
});
