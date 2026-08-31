import { todayString } from "../lib/date";
import {
  TaskRepository,
  type Task,
  type CreateTaskInput as RepoCreateInput,
  type UpdateTaskInput,
} from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";

export type TaskCreateInput = Omit<RepoCreateInput, "scheduledDate"> & {
  scheduledDate?: string;
};

/**
 * 任务业务逻辑。所有状态流转（完成/取消）与字段变更都收敛在这里，
 * UI 与 Store 不得直接操作 Repository。
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
    return this.tasks.create({
      ...input,
      scheduledDate: input.scheduledDate ?? todayString(),
    });
  }

  async updateTask(id: number, input: UpdateTaskInput): Promise<Task | null> {
    return this.tasks.update(id, input);
  }

  /** 删除任务：先清理其全部专注记录（统计数据不再包含该任务），再删除任务。 */
  async deleteTask(id: number): Promise<boolean> {
    await this.sessions.deleteByTaskId(id);
    return this.tasks.delete(id);
  }

  async completeTask(id: number): Promise<Task | null> {
    return this.tasks.update(id, {
      status: "COMPLETED",
      completedAt: Date.now(),
    });
  }

  /** 切换完成状态：已完成 → 恢复 TODO（清空完成时间）；否则 → 完成。 */
  async toggleComplete(id: number): Promise<Task | null> {
    const task = await this.tasks.findById(id);
    if (!task) return null;
    if (task.status === "COMPLETED") {
      return this.tasks.update(id, { status: "TODO", completedAt: null });
    }
    return this.tasks.update(id, { status: "COMPLETED", completedAt: Date.now() });
  }

  async cancelTask(id: number): Promise<Task | null> {
    return this.tasks.update(id, { status: "CANCELLED" });
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
}
