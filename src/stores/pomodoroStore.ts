import { create } from "zustand";
import { PomodoroTimer, type PomodoroSnapshot } from "../lib/pomodoroTimer";
import { getDb } from "../db/db";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { AchievementProgressRepository } from "../db/repositories/achievementProgressRepository";
import { FocusService } from "../services/focusService";
import { AchievementService } from "../services/achievementService";
import { notifyFocus } from "../services/notificationService";
import { loadAchievementDefinitions } from "../achievements/definitions";
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
  /** 双击任务自动规划的本次专注上下文（仅本次生效，不改全局设置） */
  plannedContext: { durationMinutes: number; count: number } | null;

  startFocus: (taskId: number, durationMs?: number) => void;
  startBreak: () => void;
  startNextFocus: () => void;
  pause: () => void;
  resume: () => void;
  endFocus: () => void;
  finalizeFocus: () => void;
  setFocusCountGoal: (n: number) => void;
  setPendingTaskId: (id: number | null) => void;
  setPlannedContext: (ctx: { durationMinutes: number; count: number } | null) => void;
  /** 放弃本次专注并返回任务选择（不落库、不完成任务） */
  abandonFocus: () => void;
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

/** 成就服务（模块级单例）：专注落库后评估，失败静默不影响专注。 */
const achievementService = new AchievementService(
  loadAchievementDefinitions(),
  new AchievementProgressRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
);

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
          void achievementService
            .evaluate()
            .then((newly) => {
              for (const a of newly) {
                useAppStore.getState().pushAchievement(a.name, a.description);
              }
            })
            .catch(() => {});
        })
        .catch(persistFail);
      if (completed) {
        set((s) => ({ completedFocusCount: s.completedFocusCount + 1 }));
        // 走满完成提醒（异步查任务名；页面切到任意页也生效）
        const tid = get().taskId;
        if (tid != null) {
          void taskRepo
            .findById(tid)
            .then((t) => notifyFocus("专注完成", t?.title ?? "未命名任务"))
            .catch(() => {});
        }
      } else {
        // 提前结束提醒
        const tid = get().taskId;
        if (tid != null) {
          void taskRepo
            .findById(tid)
            .then((t) => notifyFocus("专注结束", t?.title ?? "未命名任务"))
            .catch(() => {});
        }
      }
    };

    return {
      taskId: null,
      phase: "focus",
      completedFocusCount: 0,
      focusCountGoal: 4,
      snapshot: timer.getSnapshot(),
      showResult: false,
      sessionId: null,
      focusVersion: 0,
      taskTitle: null,
      pendingTaskId: null,
      plannedContext: null,

      startFocus: (taskId, durationMs) => {
        const state = timer.getState();
        if (state === "RUNNING" || state === "PAUSED") return; // 守卫：防双击/竞态
        // 上一段计时已自动完成但未落定（内部仍 RUNNING）时先落定，避免 start() 冲突
        if (state === "COMPLETED" && timer.getCompletedAt() === null) {
          timer.complete();
        }
        const ms =
          durationMs ?? useSettingsStore.getState().settings.pomodoroDurationMinutes * 60_000;
        timer.start(ms);
        const snap = timer.getSnapshot();
        set({ taskId, phase: "focus", showResult: false, sessionId: null, taskTitle: null, snapshot: snap });
        const plannedSeconds = Math.round(snap.durationMs / 1000);
        // 开始提醒（异步查任务名；轻量；查询失败静默）
        void taskRepo
          .findById(taskId)
          .then((t) => notifyFocus("开始专注", t?.title ?? "未命名任务"))
          .catch(() => {});
        void focus
          .start(taskId, plannedSeconds)
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
        const minutes = isLong ? settings.longBreakMinutes : settings.shortBreakMinutes;
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
        if (get().phase === "focus") void focus.pause().catch(persistFail);
      },

      resume: () => {
        if (timer.getState() !== "PAUSED") return;
        timer.resume();
        set({ snapshot: timer.getSnapshot() });
        if (get().phase === "focus") void focus.resume().catch(persistFail);
      },

      endFocus: () => {
        const state = timer.getState();
        const isAutoCompleted = state === "COMPLETED" && timer.getCompletedAt() === null;
        if (state !== "RUNNING" && state !== "PAUSED" && !isAutoCompleted) return;
        finalizeCurrentSession(); // 落定 + 持久化 +（走满时）计数
        set({ snapshot: timer.getSnapshot(), showResult: true });
      },

      finalizeFocus: () => {
        finalizeCurrentSession();
      },

      setFocusCountGoal: (n) => {
        const goal = Math.min(12, Math.max(1, Math.round(n)));
        set({ focusCountGoal: goal });
      },

      setPendingTaskId: (id) => set({ pendingTaskId: id }),

      setPlannedContext: (ctx) => set({ plannedContext: ctx }),

      abandonFocus: () => {
        const state = timer.getState();
        if (state !== "RUNNING" && state !== "PAUSED") return;
        timer.cancel();
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
