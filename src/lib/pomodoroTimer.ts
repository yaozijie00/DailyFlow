/**
 * Pomodoro Timer Engine
 *
 * 独立于 React 的纯计时引擎：
 * - 不依赖任何定时器（setInterval/setTimeout）做核心计时；
 * - 所有 elapsed 都由「真实时间戳」计算：elapsed = now - startedAt - totalPausedDuration；
 * - 因此页面失焦、窗口切换、UI 重渲染、系统休眠都不影响计时正确性；
 * - UI 层只需周期性调用 getSnapshot() 刷新显示（轮询只负责展示，不参与计时）。
 *
 * 状态机：
 *   IDLE --start()--> RUNNING --pause()--> PAUSED --resume()--> RUNNING
 *   RUNNING/PAUSED --complete()--> COMPLETED
 *   RUNNING/PAUSED --cancel()--> CANCELLED
 *   RUNNING 且 elapsed >= duration 时（惰性）自动视为 COMPLETED
 */

export type PomodoroState =
  | "IDLE"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export const DEFAULT_POMODORO_DURATION_MS = 25 * 60_000;

export interface PomodoroSnapshot {
  state: PomodoroState;
  /** 本次计时的总时长（毫秒） */
  durationMs: number;
  /** 已专注时长（毫秒），基于真实时间计算 */
  elapsedMs: number;
  /** 剩余时长（毫秒），不会为负 */
  remainingMs: number;
  /** 进度 0..1 */
  progress: number;
  startedAt: number | null;
  pausedAt: number | null;
  /** 所有暂停段的总时长（毫秒） */
  totalPausedDurationMs: number;
  completedAt: number | null;
  cancelledAt: number | null;
}

export interface PomodoroTimerOptions {
  /** 默认专注时长，默认 25 分钟 */
  durationMs?: number;
  /** 时钟注入（测试用），默认 Date.now */
  now?: () => number;
}

export class PomodoroTimer {
  private readonly now: () => number;
  private durationMs: number;
  private state: PomodoroState = "IDLE";
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private totalPausedDurationMs = 0;
  private completedAt: number | null = null;
  private cancelledAt: number | null = null;
  private readonly listeners = new Set<(snap: PomodoroSnapshot) => void>();

  constructor(options: PomodoroTimerOptions = {}) {
    this.durationMs = options.durationMs ?? DEFAULT_POMODORO_DURATION_MS;
    this.now = options.now ?? Date.now;
  }

  /** 开始计时。仅 IDLE / COMPLETED / CANCELLED 允许；可覆盖本次时长。 */
  start(durationMs?: number): PomodoroSnapshot {
    if (this.state === "RUNNING" || this.state === "PAUSED") {
      throw new Error("PomodoroTimer: cannot start() while RUNNING or PAUSED");
    }
    if (durationMs !== undefined) {
      this.durationMs = durationMs;
    }
    this.state = "RUNNING";
    this.startedAt = this.now();
    this.pausedAt = null;
    this.totalPausedDurationMs = 0;
    this.completedAt = null;
    this.cancelledAt = null;
    return this.notify();
  }

  /** 暂停计时。仅 RUNNING 允许。 */
  pause(): PomodoroSnapshot {
    if (this.state !== "RUNNING") {
      throw new Error("PomodoroTimer: cannot pause() unless RUNNING");
    }
    if (this.getEffectiveState() === "COMPLETED") {
      throw new Error("PomodoroTimer: cannot pause() a completed timer");
    }
    this.state = "PAUSED";
    this.pausedAt = this.now();
    return this.notify();
  }

  /** 恢复计时。仅 PAUSED 允许；把本次暂停段计入 totalPausedDuration。 */
  resume(): PomodoroSnapshot {
    if (this.state !== "PAUSED") {
      throw new Error("PomodoroTimer: cannot resume() unless PAUSED");
    }
    this.totalPausedDurationMs += this.now() - this.pausedAt!;
    this.pausedAt = null;
    this.state = "RUNNING";
    return this.notify();
  }

  /** 手动完成。仅 RUNNING / PAUSED 允许；时间已耗尽（惰性自动完成）时调用可落定完成状态。 */
  complete(): PomodoroSnapshot {
    if (this.state !== "RUNNING" && this.state !== "PAUSED") {
      throw new Error("PomodoroTimer: cannot complete() unless RUNNING or PAUSED");
    }
    this.foldPendingPause(); // PAUSED 结束：暂停后空等的时间计入暂停段，避免多记
    this.state = "COMPLETED";
    this.completedAt = this.now();
    return this.notify();
  }

  /** 取消计时。仅 RUNNING / PAUSED 允许。 */
  cancel(): PomodoroSnapshot {
    if (this.state !== "RUNNING" && this.state !== "PAUSED") {
      throw new Error("PomodoroTimer: cannot cancel() unless RUNNING or PAUSED");
    }
    this.foldPendingPause(); // PAUSED 取消：与 complete 一致，不把暂停后空等计入
    this.state = "CANCELLED";
    this.cancelledAt = this.now();
    return this.notify();
  }

  /**
   * 若当前处于 PAUSED，把「pausedAt 至今」的待定暂停段累加进 totalPausedDuration
   * （与 resume() 口径一致）。用于 PAUSED 直接 complete/cancel 时冻结已专注时长。
   */
  private foldPendingPause(): void {
    if (this.state === "PAUSED") {
      this.totalPausedDurationMs += this.now() - this.pausedAt!;
      this.pausedAt = null;
    }
  }

  /** 从持久化状态重建计时器（重启恢复）：根据 pausedAt 决定 RUNNING/PAUSED。 */
  restore(input: {
    durationMs: number;
    startedAt: number;
    totalPausedDurationMs: number;
    pausedAt: number | null;
  }): PomodoroSnapshot {
    this.durationMs = input.durationMs;
    this.startedAt = input.startedAt;
    this.totalPausedDurationMs = input.totalPausedDurationMs;
    this.pausedAt = input.pausedAt;
    this.state = input.pausedAt != null ? "PAUSED" : "RUNNING";
    this.completedAt = null;
    this.cancelledAt = null;
    return this.notify();
  }

  /** 当前状态。RUNNING 且时间耗尽时返回 COMPLETED（惰性自动完成）。 */
  getState(): PomodoroState {
    return this.getEffectiveState();
  }

  /** 基于真实时间计算的已专注时长（毫秒），已夹取到 [0, duration]。 */
  getElapsedMs(): number {
    switch (this.state) {
      case "IDLE":
        return 0;
      case "RUNNING":
        return this.clampElapsed(this.now() - this.startedAt! - this.totalPausedDurationMs);
      case "PAUSED":
        return this.clampElapsed(this.pausedAt! - this.startedAt! - this.totalPausedDurationMs);
      case "COMPLETED":
        return this.clampElapsed((this.completedAt ?? this.now()) - this.startedAt! - this.totalPausedDurationMs);
      case "CANCELLED":
        return this.clampElapsed((this.cancelledAt ?? this.now()) - this.startedAt! - this.totalPausedDurationMs);
    }
  }

  /** 剩余时长（毫秒），不会为负；COMPLETED 恒为 0。 */
  getRemainingMs(): number {
    if (this.getEffectiveState() === "COMPLETED") {
      return 0;
    }
    return Math.max(0, this.durationMs - this.getElapsedMs());
  }

  /** 进度 0..1 */
  getProgress(): number {
    return Math.min(1, Math.max(0, this.getElapsedMs() / this.durationMs));
  }

  getDurationMs(): number {
    return this.durationMs;
  }

  getStartedAt(): number | null {
    return this.startedAt;
  }

  getPausedAt(): number | null {
    return this.pausedAt;
  }

  getTotalPausedDurationMs(): number {
    return this.totalPausedDurationMs;
  }

  getCompletedAt(): number | null {
    return this.completedAt;
  }

  getCancelledAt(): number | null {
    return this.cancelledAt;
  }

  /** 订阅状态转换通知（仅显式方法调用触发；自动完成由 UI 轮询 getSnapshot 发现）。 */
  subscribe(listener: (snap: PomodoroSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PomodoroSnapshot {
    return {
      state: this.getEffectiveState(),
      durationMs: this.durationMs,
      elapsedMs: this.getElapsedMs(),
      remainingMs: this.getRemainingMs(),
      progress: this.getProgress(),
      startedAt: this.startedAt,
      pausedAt: this.pausedAt,
      totalPausedDurationMs: this.totalPausedDurationMs,
      completedAt: this.completedAt,
      cancelledAt: this.cancelledAt,
    };
  }

  /** RUNNING 且时间耗尽 → COMPLETED（惰性，不修改内部字段，无需定时器） */
  private getEffectiveState(): PomodoroState {
    if (this.state === "RUNNING" && this.getElapsedMs() >= this.durationMs) {
      return "COMPLETED";
    }
    return this.state;
  }

  private clampElapsed(raw: number): number {
    return Math.min(this.durationMs, Math.max(0, raw));
  }

  private notify(): PomodoroSnapshot {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
    return snap;
  }
}
