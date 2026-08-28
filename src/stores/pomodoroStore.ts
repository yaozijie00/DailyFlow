import { create } from "zustand";
import { PomodoroTimer, type PomodoroSnapshot } from "../lib/pomodoroTimer";
import { getDb } from "../db/db";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusService } from "../services/focusService";
import { useAppStore } from "./appStore";

/**
 * PomodoroStore
 *
 * 持有唯一 PomodoroTimer 引擎（模块级单例，切页/重渲染不丢失）。
 * 所有 action 均为「守卫式同步」：非法转换直接 no-op（不再抛错，修复竞态 B7）；
 * 持久化（focus_sessions + settings.active_focus）异步进行、失败 toast 提示（M3）。
 */
export interface PomodoroState {
  taskId: number | null;
  snapshot: PomodoroSnapshot;
  showResult: boolean;
  /** 当前进行中专注会话的 focus_sessions 行 id */
  sessionId: number | null;
  /** 专注会话落库版本号，统计/界面据此刷新 */
  focusVersion: number;
  /** 专注任务名（重启恢复非今日任务时兜底显示） */
  taskTitle: string | null;

  startFocus: (taskId: number, durationMs?: number) => void;
  pause: () => void;
  resume: () => void;
  endFocus: () => void;
  continueFocus: () => void;
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

function persistFail(): void {
  useAppStore.getState().pushToast("error", "专注记录保存失败");
}

export function createPomodoroStore(
  now?: () => number,
  focusService: FocusService = defaultFocusService,
) {
  let timer = new PomodoroTimer({ now });
  const focus = focusService;

  return create<PomodoroState>()((set, get) => ({
    taskId: null,
    snapshot: timer.getSnapshot(),
    showResult: false,
    sessionId: null,
    focusVersion: 0,
    taskTitle: null,

    startFocus: (taskId, durationMs) => {
      const state = timer.getState();
      if (state === "RUNNING" || state === "PAUSED") return; // 守卫：防双击/竞态
      timer.start(durationMs);
      const snap = timer.getSnapshot();
      set({ taskId, showResult: false, sessionId: null, taskTitle: null, snapshot: snap });
      const plannedSeconds = Math.round(snap.durationMs / 1000);
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

    pause: () => {
      if (timer.getState() !== "RUNNING") return;
      timer.pause();
      set({ snapshot: timer.getSnapshot() });
      void focus.pause().catch(persistFail);
    },

    resume: () => {
      if (timer.getState() !== "PAUSED") return;
      timer.resume();
      set({ snapshot: timer.getSnapshot() });
      void focus.resume().catch(persistFail);
    },

    endFocus: () => {
      const state = timer.getState();
      const isAutoCompleted = state === "COMPLETED" && timer.getCompletedAt() === null;
      if (state !== "RUNNING" && state !== "PAUSED" && !isAutoCompleted) return;

      const before = timer.getSnapshot();
      const completed = before.elapsedMs >= before.durationMs;
      if (timer.getCompletedAt() === null) timer.complete(); // 落定（含惰性自动完成）
      const snap = timer.getSnapshot();
      set({ snapshot: snap, showResult: true });
      const actualSeconds = Math.round(snap.elapsedMs / 1000);
      void focus
        .finish(completed, actualSeconds)
        .then(() => {
          set((s) => ({ focusVersion: s.focusVersion + 1, sessionId: null }));
        })
        .catch(persistFail);
    },

    continueFocus: () => {
      const { taskId } = get();
      if (taskId == null) return;
      if (timer.getState() !== "COMPLETED") return;
      if (timer.getCompletedAt() === null) timer.complete(); // 落定自动完成
      get().startFocus(taskId);
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
      // 恢复任务名（可能不属于今日任务，taskStore 查不到，这里直接查库兜底）
      let taskTitle: string | null = null;
      try {
        const task = await taskRepo.findById(active.session.taskId);
        taskTitle = task?.title ?? null;
      } catch {
        taskTitle = null;
      }
      set({
        taskId: active.session.taskId,
        sessionId: active.session.id,
        showResult: false,
        taskTitle,
        snapshot: snap,
      });
    },
  }));
}

export const usePomodoroStore = createPomodoroStore();
