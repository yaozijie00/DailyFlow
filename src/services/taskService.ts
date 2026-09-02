import { todayString } from "../lib/date";
import {
  TaskRepository,
  type Task,
  type CreateTaskInput as RepoCreateInput,
  type UpdateTaskInput,
} from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { undoManager, diffTaskUpdate } from "../lib/undoManager";
import { nextOccurrenceDate } from "../lib/repeat";

export type TaskCreateInput = Omit<RepoCreateInput, "scheduledDate"> & {
  scheduledDate?: string;
};

/**
 * 任务业务逻辑。所有状态流转（完成/取消）与字段变更都收敛在这里，
 * UI 与 Store 不得直接操作 Repository。
 *
 * 撤销接入（V1.4.1）：可逆操作（编辑/移动/完成/取消/创建）在此层捕获
 * before/after 快照并推入 undoManager；undo/redo 应用期间跳过入栈。
 */
export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly sessions: FocusSessionRepository,
  ) {}

  async getTodayTasks(): Promise<Task[]> {
    return this.getTasksByDate(todayString());
  }

  /** 按指定日期（YYYY-MM-DD）查询任务。 */
  async getTasksByDate(date: string): Promise<Task[]> {
    return this.tasks.findByDate(date);
  }

  /** 指定日期仍未完成（TODO，不含取消）的任务——昨日逾期结转用。 */
  async getUnfinishedTasksByDate(date: string): Promise<Task[]> {
    const rows = await this.tasks.findByDate(date);
    return rows.filter((t) => t.status === "TODO");
  }

  /** 标题模糊搜索（命令面板用）。 */
  async searchTasks(query: string, limit?: number): Promise<Task[]> {
    if (!query.trim()) return [];
    return this.tasks.searchByTitle(query, limit);
  }

  async createTask(input: TaskCreateInput): Promise<Task> {
    const task = await this.tasks.create({
      ...input,
      scheduledDate: input.scheduledDate ?? todayString(),
    });
    await this.tasks.reorderByTime(task.scheduledDate);
    if (!undoManager.applying) {
      const snapshot = { ...task };
      undoManager.push({
        type: "task.create",
        label: "创建任务",
        undo: async () => {
          // 撤销创建：删除该任务（含其专注记录，与删除语义一致）
          await this.deleteTask(snapshot.id);
        },
        redo: async () => {
          // 重做创建：以「原 id」还原同一行（修复：new id 会令 undo→redo→undo
          // 时撤销仍删旧 id → 残留重复任务块；AUTOINCREMENT 保证 id 不被复用）
          await this.tasks.insertRestored(snapshot);
          await this.tasks.reorderByTime(snapshot.scheduledDate);
        },
      });
    }
    return task;
  }

  async updateTask(id: number, input: UpdateTaskInput): Promise<Task | null> {
    const before = await this.tasks.findById(id);
    const updated = await this.tasks.update(id, input);
    if (updated) {
      // v1.6：仅当时间相关字段变化时才按时间重排（sort_order），
      // 否则（只改标题/备注/分类/预计等）保留原有顺序 → Timeline 块位置不跳动。
      const timeChanged =
        input.scheduledDate !== undefined ||
        input.plannedStart !== undefined ||
        input.plannedEnd !== undefined;
      if (timeChanged) {
        if (before?.scheduledDate) await this.tasks.reorderByTime(before.scheduledDate);
        await this.tasks.reorderByTime(updated.scheduledDate);
      }
      this.captureTaskUpdate(id, before, updated);
    }
    return updated;
  }

  /** 捕获一次任务状态变更（before → after）为可撤销动作。 */
  private captureTaskUpdate(id: number, before: Task | null, after: Task | null): void {
    if (undoManager.applying) return;
    if (!before || !after) return;
    const diff = diffTaskUpdate(before, after);
    if (Object.keys(diff).length === 0) return;
    undoManager.push({
      type: "task.update",
      label: "修改任务",
      undo: async () => {
        await this.updateTask(id, diffTaskUpdate(after, before));
      },
      redo: async () => {
        await this.updateTask(id, diffTaskUpdate(before, after));
      },
    });
  }

  /** 手动调整任务顺序（上下拖动）：按传入 id 顺序重写该批任务的 sort_order。 */
  async reorderTasks(orderedIds: number[]): Promise<void> {
    await this.tasks.reorder(orderedIds);
  }

  /** 删除任务：先清理其全部专注记录（统计数据不再包含该任务），再删除任务。 */
  async deleteTask(id: number): Promise<boolean> {
    if (!undoManager.applying) {
      const task = await this.tasks.findById(id);
      if (task) {
        const t = { ...task };
        const sessions = await this.sessions.findByTaskId(id);
        const ss = sessions.map((s) => ({ ...s }));
        undoManager.push({
          type: "task.delete",
          label: "删除任务",
          undo: async () => {
            await this.tasks.insertRestored(t);
            for (const s of ss) await this.sessions.insertRestored(s);
          },
          redo: async () => {
            await this.sessions.deleteByTaskId(t.id);
            await this.tasks.delete(t.id);
          },
        });
      }
    }
    await this.sessions.deleteByTaskId(id);
    return this.tasks.delete(id);
  }

  /**
   * 仅删除任务行（转为便签用）：保留 focus_sessions（FK SET NULL），
   * 统计仍计入该任务的投入时间，不因「拖回便签」丢失专注历史。
   */
  async deleteTaskKeepSessions(id: number): Promise<boolean> {
    if (!undoManager.applying) {
      const task = await this.tasks.findById(id);
      if (task) {
        const t = { ...task };
        undoManager.push({
          type: "task.delete_keep_sessions",
          label: "转为便签",
          undo: async () => {
            await this.tasks.insertRestored(t);
          },
          redo: async () => {
            await this.tasks.delete(t.id);
          },
        });
      }
    }
    return this.tasks.delete(id);
  }

  async completeTask(id: number): Promise<Task | null> {
    const before = await this.tasks.findById(id);
    if (!before) return null;
    const completing = before.status !== "COMPLETED";
    if (completing && before.repeatRule) {
      return this.completeWithRepeat(id, before);
    }
    const updated = await this.tasks.update(id, {
      status: "COMPLETED",
      completedAt: Date.now(),
    });
    this.captureTaskUpdate(id, before, updated);
    return updated;
  }

  /** 切换完成状态：已完成 → 恢复 TODO（清空完成时间）；否则 → 完成。 */
  async toggleComplete(id: number): Promise<Task | null> {
    const before = await this.tasks.findById(id);
    if (!before) return null;
    const completing = before.status !== "COMPLETED";
    if (completing && before.repeatRule) {
      return this.completeWithRepeat(id, before);
    }
    const updated =
      completing
        ? await this.tasks.update(id, { status: "COMPLETED", completedAt: Date.now() })
        : await this.tasks.update(id, { status: "TODO", completedAt: null });
    this.captureTaskUpdate(id, before, updated);
    return updated;
  }

  /**
   * 完成带重复规则的任务：完成 + 生成下一实例合并为一个复合撤销动作。
   * 下一实例复制标题/分类/预计/备注/目标/规则，日期取规则下一次（严格晚于本次）。
   */
  private async completeWithRepeat(id: number, before: Task): Promise<Task | null> {
    return undoManager.withBatchAsync(async () => {
      const updated = await this.tasks.update(id, {
        status: "COMPLETED",
        completedAt: Date.now(),
      });
      this.captureTaskUpdate(id, before, updated);
      if (updated) {
        const nextDate = nextOccurrenceDate(before.scheduledDate, before.repeatRule);
        if (nextDate) {
          const child = await this.tasks.create({
            title: before.title,
            scheduledDate: nextDate,
            categoryId: before.categoryId,
            status: "TODO",
            estimatedDuration: before.estimatedDuration,
            notes: before.notes,
            goalId: before.goalId,
            repeatRule: before.repeatRule,
          });
          await this.tasks.reorderByTime(child.scheduledDate);
          const snapshot = { ...child };
          // 随外层 batch 合并：撤销完成 = 还原状态 + 删除下一实例
          undoManager.push({
            type: "task.repeat_create",
            label: "生成重复任务",
            undo: async () => {
              await this.tasks.delete(snapshot.id);
            },
            redo: async () => {
              await this.tasks.insertRestored(snapshot);
            },
          });
        }
      }
      return updated;
    });
  }

  async cancelTask(id: number): Promise<Task | null> {
    const before = await this.tasks.findById(id);
    const updated = await this.tasks.update(id, { status: "CANCELLED" });
    this.captureTaskUpdate(id, before, updated);
    return updated;
  }

  async changeCategory(
    id: number,
    categoryId: number | null,
  ): Promise<Task | null> {
    return this.tasks.update(id, { categoryId });
  }

  async changeEstimatedDuration(
    id: number,
    estimatedDuration: number | null,
  ): Promise<Task | null> {
    return this.tasks.update(id, { estimatedDuration });
  }

  /** 任务维度的专注汇总（详情面板用）：总实际投入 / 会话次数 / 走满番茄数。 */
  async getTaskFocusStats(
    taskId: number,
  ): Promise<{ totalSeconds: number; count: number; completedCount: number }> {
    const sessions = await this.sessions.findByTaskId(taskId);
    let totalSeconds = 0;
    let completedCount = 0;
    for (const s of sessions) {
      totalSeconds += s.actualDuration;
      if (s.completed) completedCount += 1;
    }
    return { totalSeconds, count: sessions.length, completedCount };
  }
}
