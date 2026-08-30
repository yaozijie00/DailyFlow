import { todayString } from "../lib/date";
import {
  TaskRepository,
  type Task,
  type CreateTaskInput as RepoCreateInput,
  type UpdateTaskInput,
} from "../db/repositories/taskRepository";

export type TaskCreateInput = Omit<RepoCreateInput, "scheduledDate"> & {
  scheduledDate?: string;
};

/**
 * 任务业务逻辑。所有状态流转（完成/取消）与字段变更都收敛在这里，
 * UI 与 Store 不得直接操作 Repository。
 */
export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

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

  async deleteTask(id: number): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async completeTask(id: number): Promise<Task | null> {
    return this.tasks.update(id, {
      status: "COMPLETED",
      completedAt: Date.now(),
    });
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
