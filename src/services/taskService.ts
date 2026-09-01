import { todayString } from "../lib/date";
import {
  TaskRepository,
  type Task,
  type CreateTaskInput as RepoCreateInput,
  type UpdateTaskInput,
} from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { undoManager, diffTaskUpdate } from "../lib/undoManager";

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
          // 重做创建：以相同字段重建（新 id）
          const re = await this.tasks.create({
            title: snapshot.title,
            scheduledDate: snapshot.scheduledDate,
            categoryId: snapshot.categoryId,
            status: snapshot.status,
            estimatedDuration: snapshot.estimatedDuration,
            plannedStart: snapshot.plannedStart,
            plannedEnd: snapshot.plannedEnd,
            actualDuration: snapshot.actualDuration,
            completedAt: snapshot.completedAt,
            notes: snapshot.notes,
            goalId: snapshot.goalId,
          });
          await this.tasks.reorderByTime(re.scheduledDate);
        },
      });
    }
    return task;
  }

  async updateTask(id: number, input: UpdateTaskInput): Promise<Task | null> {
    const before = await this.tasks.findById(id);
    const updated = await this.tasks.update(id, input);
    if (updated) {
      if (before?.scheduledDate) await this.tasks.reorderByTime(before.scheduledDate);
      await this.tasks.reorderByTime(updated.scheduledDate);
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
    await this.sessions.deleteByTaskId(id);
    return this.tasks.delete(id);
  }

  async completeTask(id: number): Promise<Task | null> {
    const before = await this.tasks.findById(id);
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
    const updated =
      before.status === "COMPLETED"
        ? await this.tasks.update(id, { status: "TODO", completedAt: null })
        : await this.tasks.update(id, { status: "COMPLETED", completedAt: Date.now() });
    this.captureTaskUpdate(id, before, updated);
    return updated;
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
