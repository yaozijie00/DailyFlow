import { describe, it, expect } from "vitest";
import { PomodoroTimer, type PomodoroState } from "./pomodoroTimer";

const MINUTE = 60_000;
const DEFAULT_DURATION = 25 * MINUTE;

/** 可手动拨动的假时钟，用于模拟时间流逝、系统休眠等场景 */
function makeFakeClock() {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function makeTimer(durationMs: number = DEFAULT_DURATION) {
  const clock = makeFakeClock();
  const timer = new PomodoroTimer({ durationMs, now: clock.now });
  return { timer, clock };
}

describe("PomodoroTimer 初始状态", () => {
  it("初始为 IDLE，剩余时间为默认 25 分钟", () => {
    const { timer } = makeTimer();
    expect(timer.getState()).toBe("IDLE");
    expect(timer.getDurationMs()).toBe(DEFAULT_DURATION);
    expect(timer.getRemainingMs()).toBe(DEFAULT_DURATION);
    expect(timer.getElapsedMs()).toBe(0);
    expect(timer.getProgress()).toBe(0);
    expect(timer.getStartedAt()).toBeNull();
    expect(timer.getPausedAt()).toBeNull();
    expect(timer.getTotalPausedDurationMs()).toBe(0);
  });

  it("构造函数可设置默认时长", () => {
    const clock = makeFakeClock();
    const timer = new PomodoroTimer({ durationMs: 15 * MINUTE, now: clock.now });
    expect(timer.getRemainingMs()).toBe(15 * MINUTE);
  });
});

describe("start()", () => {
  it("进入 RUNNING 并记录 startedAt", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    expect(timer.getState()).toBe("RUNNING");
    expect(timer.getStartedAt()).toBe(clock.now());
  });

  it("支持自定义时长 start(10 分钟)", () => {
    const { timer, clock } = makeTimer();
    timer.start(10 * MINUTE);
    expect(timer.getDurationMs()).toBe(10 * MINUTE);
    clock.advance(5 * MINUTE);
    expect(timer.getRemainingMs()).toBe(5 * MINUTE);
  });
});

describe("elapsed 基于真实时间计算（无 setInterval 递减）", () => {
  it("运行 5 分钟后 elapsed=5min、remaining=20min", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(5 * MINUTE);
    expect(timer.getElapsedMs()).toBe(5 * MINUTE);
    expect(timer.getRemainingMs()).toBe(20 * MINUTE);
    expect(timer.getProgress()).toBeCloseTo(5 / 25, 5);
  });

  it("页面失焦/窗口切换期间不调用任何方法，计时结果依然正确", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(7 * MINUTE); // 期间无任何调用
    expect(timer.getElapsedMs()).toBe(7 * MINUTE);
    expect(timer.getRemainingMs()).toBe(18 * MINUTE);
  });

  it("getSnapshot() 多次调用值一致（UI 重渲染不产生累计误差）", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(3 * MINUTE);
    const a = timer.getSnapshot();
    const b = timer.getSnapshot();
    expect(a).toEqual(b);
    expect(a.state).toBe("RUNNING");
    expect(a.elapsedMs).toBe(3 * MINUTE);
  });
});

describe("pause() / resume()", () => {
  it("pause() 记录 pausedAt，暂停期间时间不再累计", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(5 * MINUTE);
    timer.pause();
    expect(timer.getPausedAt()).toBe(clock.now());
    clock.advance(10 * MINUTE); // 模拟暂停期间休眠
    expect(timer.getElapsedMs()).toBe(5 * MINUTE);
    expect(timer.getRemainingMs()).toBe(20 * MINUTE);
    expect(timer.getState()).toBe("PAUSED");
  });

  it("resume() 将暂停时长计入 totalPausedDuration 并继续计时", () => {
    const { timer, clock } = makeTimer();
    timer.start(); // t=0
    clock.advance(5 * MINUTE); // t=5min elapsed=5min
    timer.pause(); // pausedAt=5min
    clock.advance(3 * MINUTE); // t=8min 暂停 3 分钟
    timer.resume(); // totalPaused += 3min
    expect(timer.getTotalPausedDurationMs()).toBe(3 * MINUTE);
    expect(timer.getPausedAt()).toBeNull();
    clock.advance(2 * MINUTE); // t=10min 再运行 2 分钟
    expect(timer.getElapsedMs()).toBe(7 * MINUTE); // 10 - 3(暂停)
    expect(timer.getRemainingMs()).toBe(18 * MINUTE);
  });

  it("多次 暂停/恢复 累积 totalPausedDuration", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(2 * MINUTE);
    timer.pause();
    clock.advance(1 * MINUTE);
    timer.resume();
    clock.advance(3 * MINUTE);
    timer.pause();
    clock.advance(2 * MINUTE);
    timer.resume();
    expect(timer.getTotalPausedDurationMs()).toBe(3 * MINUTE);
    expect(timer.getElapsedMs()).toBe(5 * MINUTE);
    expect(timer.getRemainingMs()).toBe(20 * MINUTE);
  });

  it("PAUSED 状态下时间流逝不会自动完成", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(5 * MINUTE);
    timer.pause();
    clock.advance(30 * MINUTE); // 暂停中休眠 30 分钟
    expect(timer.getState()).toBe("PAUSED");
    expect(timer.getRemainingMs()).toBe(20 * MINUTE);
  });
});

describe("complete() / 自动完成", () => {
  it("complete() 手动完成 → COMPLETED，剩余 0", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(10 * MINUTE);
    timer.complete();
    expect(timer.getState()).toBe("COMPLETED");
    expect(timer.getRemainingMs()).toBe(0);
    expect(timer.getElapsedMs()).toBe(10 * MINUTE);
  });

  it("PAUSED 状态下也能 complete()", () => {
    const { timer } = makeTimer();
    timer.start();
    timer.pause();
    timer.complete();
    expect(timer.getState()).toBe("COMPLETED");
  });

  it("PAUSED 直接 complete：不计暂停后空等的时间（只记暂停前实际时长）", () => {
    const { timer, clock } = makeTimer();
    timer.start(); // t=0
    clock.advance(8 * MINUTE); // 运行 8 分钟
    timer.pause(); // pausedAt=8min
    clock.advance(60 * MINUTE); // 暂停后空等 1 小时再结束
    timer.complete();
    expect(timer.getState()).toBe("COMPLETED");
    expect(timer.getElapsedMs()).toBe(8 * MINUTE); // 而非 68 分钟
    expect(timer.getRemainingMs()).toBe(0);
  });

  it("PAUSED 直接 cancel：同样不计暂停后空等的时间", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(8 * MINUTE);
    timer.pause();
    clock.advance(60 * MINUTE);
    timer.cancel();
    expect(timer.getState()).toBe("CANCELLED");
    expect(timer.getElapsedMs()).toBe(8 * MINUTE);
  });

  it("多次 暂停/恢复 后 PAUSED 结束：暂停段全部扣除，不重复计算", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(8 * MINUTE);
    timer.pause(); // 暂停 2 分钟
    clock.advance(2 * MINUTE);
    timer.resume();
    clock.advance(5 * MINUTE); // 再运行 5 分钟
    timer.pause(); // 暂停 3 分钟
    clock.advance(3 * MINUTE);
    timer.resume();
    clock.advance(4 * MINUTE); // 再运行 4 分钟
    timer.pause(); // 暂停后空等 30 分钟再结束
    clock.advance(30 * MINUTE);
    timer.complete();
    expect(timer.getElapsedMs()).toBe(17 * MINUTE); // 8+5+4，暂停段(2+3+30)全部扣除
  });

  it("时间耗尽自动进入 COMPLETED（无需调用 complete()）", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(25 * MINUTE);
    expect(timer.getState()).toBe("COMPLETED");
    expect(timer.getRemainingMs()).toBe(0);
  });

  it("运行中系统休眠 2 小时：恢复后自动完成且剩余 0", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(2 * 60 * MINUTE); // 系统休眠
    expect(timer.getState()).toBe("COMPLETED");
    expect(timer.getRemainingMs()).toBe(0);
    expect(timer.getElapsedMs()).toBe(DEFAULT_DURATION); // 不超时溢出
  });

  it("时间耗尽自动完成后：complete() 可落定，随后可重新 start()", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(26 * MINUTE);
    expect(timer.getState()).toBe("COMPLETED");
    timer.complete(); // 落定自动完成（不应抛错）
    expect(timer.getState()).toBe("COMPLETED");
    timer.start(); // 重新开始同一引擎
    expect(timer.getState()).toBe("RUNNING");
    expect(timer.getElapsedMs()).toBe(0);
  });
});

describe("restore（重启恢复）", () => {
  it("重建 RUNNING：elapsed 按恢复的时间戳计算", () => {
    let now = 10_000;
    const timer = new PomodoroTimer({ now: () => now });
    timer.restore({
      durationMs: 25 * MINUTE,
      startedAt: 5_000,
      totalPausedDurationMs: 0,
      pausedAt: null,
    });
    expect(timer.getState()).toBe("RUNNING");
    expect(timer.getElapsedMs()).toBe(5_000);
    now = 20_000;
    expect(timer.getElapsedMs()).toBe(15_000);
  });

  it("重建 PAUSED：含累计暂停时长，时间冻结，恢复后正确累加", () => {
    let now = 20_000;
    const timer = new PomodoroTimer({ now: () => now });
    timer.restore({
      durationMs: 25 * MINUTE,
      startedAt: 0,
      totalPausedDurationMs: 3_000,
      pausedAt: 12_000,
    });
    expect(timer.getState()).toBe("PAUSED");
    // elapsed = pausedAt - startedAt - accumulated = 12000 - 3000
    expect(timer.getElapsedMs()).toBe(9_000);
    now = 99_000; // 暂停中时间流逝
    expect(timer.getElapsedMs()).toBe(9_000);
    timer.resume();
    expect(timer.getTotalPausedDurationMs()).toBe(3_000 + (99_000 - 12_000));
  });
});

describe("cancel()", () => {
  it("RUNNING 与 PAUSED 均可 cancel() → CANCELLED", () => {
    const { timer } = makeTimer();
    timer.start();
    timer.cancel();
    expect(timer.getState()).toBe("CANCELLED");

    const { timer: t2 } = makeTimer();
    t2.start();
    t2.pause();
    t2.cancel();
    expect(t2.getState()).toBe("CANCELLED");
  });
});

describe("状态机非法转换", () => {
  it("IDLE 下 pause/resume/complete/cancel 抛错", () => {
    const { timer } = makeTimer();
    expect(() => timer.pause()).toThrow();
    expect(() => timer.resume()).toThrow();
    expect(() => timer.complete()).toThrow();
    expect(() => timer.cancel()).toThrow();
  });

  it("RUNNING 下 start/resume 抛错；PAUSED 下 start/pause 抛错", () => {
    const { timer } = makeTimer();
    timer.start();
    expect(() => timer.start()).toThrow();
    expect(() => timer.resume()).toThrow();
    timer.pause();
    expect(() => timer.pause()).toThrow();
    expect(() => timer.start()).toThrow();
  });
});

describe("重新开始", () => {
  it("COMPLETED 后可重新 start()，计时与暂停时长清零", () => {
    const { timer, clock } = makeTimer();
    timer.start();
    clock.advance(5 * MINUTE);
    timer.pause();
    clock.advance(2 * MINUTE);
    timer.resume();
    timer.complete();

    timer.start();
    expect(timer.getState()).toBe("RUNNING");
    expect(timer.getElapsedMs()).toBe(0);
    expect(timer.getTotalPausedDurationMs()).toBe(0);
    expect(timer.getStartedAt()).toBe(clock.now());

    clock.advance(1 * MINUTE);
    expect(timer.getElapsedMs()).toBe(1 * MINUTE);
  });

  it("CANCELLED 后可重新 start()", () => {
    const { timer } = makeTimer();
    timer.start();
    timer.cancel();
    timer.start();
    expect(timer.getState()).toBe("RUNNING");
  });
});

describe("订阅通知", () => {
  it("subscribe 在每次状态转换时收到快照，unsubscribe 后不再通知", () => {
    const { timer } = makeTimer();
    const events: PomodoroState[] = [];
    const unsub = timer.subscribe((snap) => events.push(snap.state));

    timer.start();
    timer.pause();
    timer.resume();
    timer.complete();
    expect(events).toEqual(["RUNNING", "PAUSED", "RUNNING", "COMPLETED"]);

    unsub();
    timer.start(); // 不应再通知
    expect(events).toHaveLength(4);
  });
});
