import { FocusSessionRepository, type FocusSession } from "../db/repositories/focusSessionRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { TaskRepository } from "../db/repositories/taskRepository";

const ACTIVE_FOCUS_KEY = "active_focus";

export interface ActiveFocusState {
  sessionId: number;
  pausedAt: number | null;
  accumulatedPauseMs: number;
}

/**
 * 专注持久化服务（设计文档 5.3）：
 * - 开始专注：写 focus_sessions 行（ended_at=null）+ settings.active_focus；
 * - 暂停/继续：更新 active_focus 的 pausedAt / accumulatedPauseMs；
 * - 结束/放弃：回填 ended_at / completed / actual_duration，累加任务实际时长，清空 active_focus；
 * - 重启恢复：读进行中会话 + active_focus 重建计时上下文。
 */
export class FocusService {
  constructor(
    private readonly sessions: FocusSessionRepository,
    private readonly settings: SettingsRepository,
    private readonly tasks: TaskRepository,
    private readonly now: () => number = Date.now,
  ) {}

  /** 开始专注：写入进行中会话并记录 active_focus。 */
  async start(taskId: number, plannedDurationSeconds: number): Promise<FocusSession> {
    const session = await this.sessions.create({
      taskId,
      plannedDuration: plannedDurationSeconds,
      startedAt: this.now(),
    });
    await this.settings.set(
      ACTIVE_FOCUS_KEY,
      JSON.stringify({ sessionId: session.id, pausedAt: null, accumulatedPauseMs: 0 }),
    );
    return session;
  }

  /** 暂停：记录 pausedAt。 */
  async pause(): Promise<void> {
    const active = await this.getActiveState();
    if (!active || active.pausedAt != null) return;
    await this.settings.set(
      ACTIVE_FOCUS_KEY,
      JSON.stringify({ ...active, pausedAt: this.now() }),
    );
  }

  /** 继续：把本次暂停段累加进 accumulatedPauseMs。 */
  async resume(): Promise<void> {
    const active = await this.getActiveState();
    if (!active || active.pausedAt == null) return;
    const accumulatedPauseMs = active.accumulatedPauseMs + (this.now() - active.pausedAt);
    await this.settings.set(
      ACTIVE_FOCUS_KEY,
      JSON.stringify({ sessionId: active.sessionId, pausedAt: null, accumulatedPauseMs }),
    );
  }

  /** 结束专注：回填会话、累加任务实际时长、清空 active_focus。completed 表示是否走满。 */
  async finish(completed: boolean, actualDurationSeconds: number): Promise<void> {
    const active = await this.getActiveState();
    if (!active) return;
    const session = await this.sessions.findById(active.sessionId);
    if (session) {
      await this.sessions.update(session.id, {
        endedAt: this.now(),
        completed,
        actualDuration: actualDurationSeconds,
      });
      const task = await this.tasks.findById(session.taskId);
      if (task) {
        await this.tasks.update(task.id, {
          actualDuration: (task.actualDuration ?? 0) + actualDurationSeconds,
        });
      }
    }
    await this.settings.delete(ACTIVE_FOCUS_KEY);
  }

  /** 读取当前 active_focus 状态（无则 null）。 */
  async getActiveState(): Promise<ActiveFocusState | null> {
    const raw = await this.settings.get(ACTIVE_FOCUS_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ActiveFocusState>;
      if (typeof parsed.sessionId !== "number") return null;
      return {
        sessionId: parsed.sessionId,
        pausedAt: parsed.pausedAt ?? null,
        accumulatedPauseMs: parsed.accumulatedPauseMs ?? 0,
      };
    } catch {
      return null;
    }
  }

  /** 启动恢复：返回进行中会话的重建上下文；无进行中会话（或数据不一致）返回 null。 */
  async getActiveForRestore(): Promise<{
    session: FocusSession;
    pausedAt: number | null;
    accumulatedPauseMs: number;
  } | null> {
    const active = await this.getActiveState();
    const open = await this.sessions.findOpen();
    if (!active || !open || active.sessionId !== open.id) {
      // 孤儿 active_focus（无对应进行中会话）→ 清理
      if (active && !open) {
        await this.settings.delete(ACTIVE_FOCUS_KEY);
      }
      return null;
    }
    return { session: open, pausedAt: active.pausedAt, accumulatedPauseMs: active.accumulatedPauseMs };
  }
}
