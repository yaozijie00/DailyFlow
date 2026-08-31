import {
  GoalRepository,
  type Goal,
  type GoalWithProgress,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "../db/repositories/goalRepository";

/**
 * 长期目标业务逻辑。目标独立于日期持久存在：
 * 未完成则持续显示；完成保留历史数据（不物理删除）。
 * 进度 = 关联任务（不含已取消）中已完成的比例，由仓库聚合查询。
 */
export class GoalService {
  constructor(private readonly goals: GoalRepository) {}

  /** 进行中目标 + 关联任务进度。 */
  async listActiveWithProgress(): Promise<GoalWithProgress[]> {
    return this.goals.listActiveWithProgress();
  }

  /** 已完成目标（历史）。 */
  async listCompleted(): Promise<Goal[]> {
    return this.goals.listCompleted();
  }

  async create(input: CreateGoalInput): Promise<Goal> {
    return this.goals.create(input);
  }

  async update(id: number, input: UpdateGoalInput): Promise<Goal | null> {
    return this.goals.update(id, input);
  }

  /** 完成目标（保留数据）。 */
  async complete(id: number): Promise<Goal | null> {
    return this.goals.complete(id);
  }

  async delete(id: number): Promise<boolean> {
    return this.goals.delete(id);
  }
}
