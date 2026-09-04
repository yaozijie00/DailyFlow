import { create } from "zustand";
import { PomodoroTimer, type PomodoroSnapshot } from "../lib/pomodoroTimer";
import { getDb } from "../db/db";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusService } from "../services/focusService";
import {
  notifyFocusStart,
  notifyFocusEnd,
  scheduleFocusEndNotification,
  cancelScheduledFocusEndNotification,
} from "../services/notificationService";
import { evaluateAndNotify } from "../services/achievementRuntime";
import { useAppStore } from "./appStore";
import { useSettingsStore } from "./settingsStore";

/**
 * PomodoroStore
 *
 * 持有唯一 PomodoroTimer 引擎（模块级单例，切页/重渲染不丢失）。
 * 支持完整番茄循环：Focus → Short Break → … → Long Break（达到 longBreakInterval 后长休息）。
 * 所有 action 均为「守卫式同步」：非法转换直接 no-op（不抛错，修复竞态 B7）；
 * 专注会话持久化（focus_sessions + settings.active_focus）异步进行、失败 toast 提示（M3）。
 * 休息阶段不写 focus_sessions（只在前端计时）。
 */
export type PomodoroPhase = "focus" | "short_break" | "long_break";

export interface PomodoroState {
  taskId: number | null;
  /** 当前计时阶段 */
  phase: PomodoroPhase;
  /** 本轮已完成的专注数（用于长休息间隔；应用重启后从 0 重新累计） */
  completedFocusCount: number;
  /** 本轮番茄目标（内存、可调；仅用于进度显示，不影响长休息间隔） */
  focusCountGoal: number;
  /** 本次专注时长覆盖（分钟；null=跟随 Settings 默认值；2.0.x 双层参数） */
  focusMinutesOverride: number | null;
  /** 本次休息时长覆盖（分钟，短休息；null=跟随 Settings 默认值） */
  breakMinutesOverride: number | null;
  snapshot: PomodoroSnapshot;
  showResult: boolean;
  /** 当前进行中专注会话的 focus_sessions 行 id */
  sessionId: number | null;
  /** 专注会话落库版本号，统计/界面据此刷新 */
  focusVersion: number;
  /** 专注任务名（重启恢复非今日任务时兜底显示） */
  taskTitle: string | null;
  /** 待选任务（双击时间轴任务预选；IDLE 时自动选中，不中断进行中的专注） */
  pendingTaskId: number | null;

  startFocus: (taskId: number, durationMs?: number) => void;
  startBreak: () => void;
  startNextFocus: () => void;
  pause: () => void;
  resume: () => void;
  endFocus: () => void;
  finalizeFocus: () => void;
  setFocusCountGoal: (n: number) => void;
  /** 本次专注/休息覆盖（2.0.x：页面调整不写回 Settings） */
  setFocusMinutesOverride: (n: number | null) => void;
  setBreakMinutesOverride: (n: number | null) => void;
  /** 清空本次覆盖（新一轮开始 / 恢复默认） */
  clearFocusOverrides: () => void;
  setPendingTaskId: (id: number | null) => void;
  /** 放弃本次专注并返回任务选择（不落库、不完成任务） */
  abandonFocus: () => void;
  /** 结束本轮/结束会话（v2.3.x）：不自动进入下一阶段，回到任务选择并清零本轮番茄计数 */
  endSession: () => void;
  refresh: () => void;
  reset: () => void;
  /** 启动时从持久化状态恢复进行中的专注 */
  restoreActiveFocus: () => Promise<void>;
}

const taskRepo = new TaskRepository(getDb());

const defaultFocusService = new FocusService(
  new FocusSessionRepository(getDb()),
  new SettingsRepository(getDb()),
  taskRepo,
);

/** 共享专注服务单例（专注页今日历史等只读查询复用，避免重复实例化）。 */
export { defaultFocusService };

function persistFail(): void {
  useAppStore.getState().pushToast("error", "专注记录保存失败");
}

export function createPomodoroStore(
  now?: () => number,
  focusService: FocusService = defaultFocusService,
) {
  let timer = new PomodoroTimer({ now });
  const focus = focusService;

  return create<PomodoroState>()((set, get) => {
    /**
     * 落定并持久化当前专注会话（幂等：已落定则跳过）。
     * 走满（completed=true）时累计本轮专注计数。休息阶段无会话，直接跳过。
     *
     * 通知职责（V1.4.1 Bug 3）：
     * - 自然走满的系统通知由 Rust 原生调度线程在结束时刻发送（最小化/后台也准时）；
     * - 提前结束的系统通知由调用方（endFocus）在用户操作时发送；
     * - 这里只负责落库/计数/成就，不再发送系统通知，避免重复提醒。
     */
    const finalizeCurrentSession = (): void => {
      if (get().phase !== "focus") return;
      if (timer.getCompletedAt() !== null) return; // 已落定（幂等，避免重复累计实际时长）
      timer.complete(); // 落定（RUNNING/PAUSED → COMPLETED）
      const snap = timer.getSnapshot();
      const completed = snap.elapsedMs >= snap.durationMs;
      const actualSeconds = Math.round(snap.elapsedMs / 1000);
      void focus
        .finish(completed, actualSeconds)
        .then(() => {
          set((s) => ({ focusVersion: s.focusVersion + 1, sessionId: null }));
          // 专注落库成功后评估成就（异步；失败静默，不影响专注记录）
          void evaluateAndNotify();
        })
        .catch(persistFail);
      if (completed) {
        set((s) => ({ completedFocusCount: s.completedFocusCount + 1 }));
      }
    };

    return {
      taskId: null,
      phase: "focus",
      completedFocusCount: 0,
      focusCountGoal: 1, // 2.0.x：默认 1 个番茄钟，进入即可开始
      focusMinutesOverride: null,
      breakMinutesOverride: null,
      snapshot: timer.getSnapshot(),
      showResult: false,
      sessionId: null,
      focusVersion: 0,
      taskTitle: null,
      pendingTaskId: null,

      startFocus: (taskId, durationMs) => {
        const state = timer.getState();
        if (state === "RUNNING" || state === "PAUSED") return; // 守卫：防双击/竞态
        // 上一段计时已自动完成但未落定（内部仍 RUNNING）时先落定，避免 start() 冲突
        if (state === "COMPLETED" && timer.getCompletedAt() === null) {
          finalizeCurrentSession(); // 专注阶段：落库旧会话（此前只 complete 不落库 → 遗留开放会话）
          if (timer.getCompletedAt() === null) timer.complete(); // 休息计时器：仅落定状态
        }
        const settings = useSettingsStore.getState().settings;
        const ms =
          durationMs ??
          ((get().focusMinutesOverride ?? settings.pomodoroDurationMinutes) * 60_000);
        timer.start(ms);
        const snap = timer.getSnapshot();
        set({ taskId, phase: "focus", showResult: false, sessionId: null, taskTitle: null, snapshot: snap });
        const plannedSeconds = Math.round(snap.durationMs / 1000);
        // 2.0.x：本次循环计划（不回写 Settings 默认）随 session 落库
        const sessionPlan = {
          breakMinutes: get().breakMinutesOverride ?? settings.shortBreakMinutes,
          breakCount: settings.longBreakInterval,
          pomodoroCount: get().focusCountGoal,
        };
        // 调度「专注完成」系统通知（Rust 原生线程，最小化/后台也准时）
        scheduleFocusEndNotification(Date.now() + ms, Math.round(ms / 60_000));
        // 开始提醒（异步查任务名；轻量；查询失败静默）
        void taskRepo
          .findById(taskId)
          .then((t) => notifyFocusStart(t?.title ?? "未命名任务"))
          .catch(() => {});
        void focus
          .start(taskId, plannedSeconds, sessionPlan)
          .then((session) => {
            set((s) => ({ sessionId: session.id, focusVersion: s.focusVersion + 1 }));
          })
          .catch(() => {
            set({ sessionId: null });
            persistFail();
          });
      },

      startBreak: () => {
        if (get().phase !== "focus") return;
        if (timer.getState() !== "COMPLETED") return; // 仅走满的专注进入休息
        finalizeCurrentSession(); // 落定 + 累计计数
        const settings = useSettingsStore.getState().settings;
        const count = get().completedFocusCount;
        const isLong = count >= settings.longBreakInterval;
        const minutes = isLong
          ? settings.longBreakMinutes
          : (get().breakMinutesOverride ?? settings.shortBreakMinutes);
        timer.start(minutes * 60_000);
        set({
          phase: isLong ? "long_break" : "short_break",
          completedFocusCount: isLong ? 0 : count,
          showResult: false,
          snapshot: timer.getSnapshot(),
        });
      },

      startNextFocus: () => {
        const { taskId, phase } = get();
        if (taskId == null) return;
        const state = timer.getState();
        // 专注阶段运行/暂停中不能重新开始；休息阶段可随时「跳过休息」
        if (phase === "focus" && (state === "RUNNING" || state === "PAUSED")) return;
        if (phase !== "focus" && (state === "RUNNING" || state === "PAUSED")) {
          timer.cancel(); // 放弃本次休息计时
        }
        get().startFocus(taskId);
      },

      pause: () => {
        if (timer.getState() !== "RUNNING") return;
        timer.pause();
        set({ snapshot: timer.getSnapshot() });
        if (get().phase === "focus") {
          cancelScheduledFocusEndNotification(); // 暂停：取消已调度的完成通知
          void focus.pause().catch(persistFail);
        }
      },

      resume: () => {
        if (timer.getState() !== "PAUSED") return;
        timer.resume();
        set({ snapshot: timer.getSnapshot() });
        if (get().phase === "focus") {
          // 恢复：按剩余时长重新调度完成通知
          const snap = timer.getSnapshot();
          scheduleFocusEndNotification(Date.now() + snap.remainingMs, Math.round(snap.durationMs / 60_000));
          void focus.resume().catch(persistFail);
        }
      },

      endFocus: () => {
        const state = timer.getState();
        const isAutoCompleted = state === "COMPLETED" && timer.getCompletedAt() === null;
        if (state !== "RUNNING" && state !== "PAUSED" && !isAutoCompleted) return;
        const earlyEnd = state === "RUNNING" || state === "PAUSED";
        if (earlyEnd) cancelScheduledFocusEndNotification(); // 提前结束：取消调度
        finalizeCurrentSession(); // 落定 + 持久化 +（走满时）计数
        set({ snapshot: timer.getSnapshot(), showResult: true });
        // 提前结束：发送系统通知（含实际投入分钟）；走满时由 Rust 调度已通知，不重复
        if (earlyEnd) {
          const actualMinutes = Math.round(timer.getElapsedMs() / 60_000);
          const tid = get().taskId;
          if (tid != null) {
            void taskRepo
              .findById(tid)
              .then((t) => notifyFocusEnd(t?.title ?? "未命名任务", false, actualMinutes))
              .catch(() => {});
          }
        }
      },

      finalizeFocus: () => {
        finalizeCurrentSession();
      },

      setFocusCountGoal: (n) => {
        const goal = Math.min(12, Math.max(1, Math.round(n)));
        set({ focusCountGoal: goal });
      },

      setFocusMinutesOverride: (n) => {
        if (n == null) set({ focusMinutesOverride: null });
        else set({ focusMinutesOverride: Math.min(180, Math.max(5, Math.round(n))) });
      },

      setBreakMinutesOverride: (n) => {
        if (n == null) set({ breakMinutesOverride: null });
        else set({ breakMinutesOverride: Math.min(60, Math.max(1, Math.round(n))) });
      },

      clearFocusOverrides: () =>
        set({ focusMinutesOverride: null, breakMinutesOverride: null }),

      setPendingTaskId: (id) => set({ pendingTaskId: id }),

      abandonFocus: () => {
        const state = timer.getState();
        if (state !== "RUNNING" && state !== "PAUSED") return;
        timer.cancel();
        cancelScheduledFocusEndNotification(); // 放弃：取消调度
        void focus.abandon().catch(persistFail);
        // 重建 timer 回到 IDLE，可重新选择任务（不落库、不完成任务）
        timer = new PomodoroTimer({ now });
        set({
          taskId: null,
          phase: "focus",
          sessionId: null,
          showResult: false,
          taskTitle: null,
          pendingTaskId: null,
          snapshot: timer.getSnapshot(),
        });
      },

      refresh: () => {
        const snap = timer.getSnapshot();
        // 看门狗（Bug 3）：时间耗尽自动完成时立即落库，不依赖用户点击；
        // 最小化/后台时 WebView2 定时器可能被节流，恢复可见/打开后第一次轮询即补落库，
        // 系统通知由 Rust 原生调度线程在结束时刻准时发送。
        if (snap.state === "COMPLETED" && timer.getCompletedAt() === null) {
          finalizeCurrentSession();
        }
        set((s) => ({
          snapshot: snap,
          showResult: s.showResult || (snap.state === "COMPLETED" && s.taskId !== null),
        }));
      },

      reset: () => {
        timer = new PomodoroTimer({ now });
        set({
          taskId: null,
          phase: "focus",
          sessionId: null,
          showResult: false,
          taskTitle: null,
          focusMinutesOverride: null,
          breakMinutesOverride: null,
          snapshot: timer.getSnapshot(),
        });
      },

      /** 用户主动结束本轮/会话：回到待选状态（不再自动连开下一阶段），本轮番茄计数清零。 */
      endSession: () => {
        timer = new PomodoroTimer({ now });
        set({
          taskId: null,
          phase: "focus",
          sessionId: null,
          showResult: false,
          taskTitle: null,
          pendingTaskId: null,
          focusMinutesOverride: null,
          breakMinutesOverride: null,
          completedFocusCount: 0,
          snapshot: timer.getSnapshot(),
        });
      },

      restoreActiveFocus: async () => {
        const active = await focus.getActiveForRestore();
        if (!active) return;
        const snap = timer.restore({
          durationMs: active.session.plannedDuration * 1000,
          startedAt: active.session.startedAt,
          totalPausedDurationMs: active.accumulatedPauseMs,
          pausedAt: active.pausedAt,
        });
        // 恢复任务名（可能不属于今日任务，taskStore 查不到，这里直接查库兜底；task_id 可空）
        let taskTitle: string | null = null;
        try {
          if (active.session.taskId != null) {
            const task = await taskRepo.findById(active.session.taskId);
            taskTitle = task?.title ?? null;
          }
        } catch {
          taskTitle = null;
        }
        // 恢复「专注完成」通知调度：运行中会话按剩余时长重新调度；暂停中不调度
        if (active.pausedAt == null) {
          const endAtMs =
            active.session.startedAt +
            active.session.plannedDuration * 1000 -
            active.accumulatedPauseMs;
          scheduleFocusEndNotification(
            endAtMs,
            Math.round(active.session.plannedDuration / 60),
          );
        }
        set({
          taskId: active.session.taskId,
          phase: "focus",
          sessionId: active.session.id,
          showResult: false,
          taskTitle,
          snapshot: snap,
        });
      },
    };
  });
}

export const usePomodoroStore = createPomodoroStore();
