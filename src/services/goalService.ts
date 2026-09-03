import {
  GoalRepository,
  type Goal,
  type GoalWithProgress,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "../db/repositories/goalRepository";
import { undoManager } from "../lib/undoManager";

/**
 * 长期目标业务逻辑。目标独立于日期持久存在：
 * 未完成则持续显示；完成保留历史数据（不物理删除）。
 * 进度 = 关联任务（不含已取消）中已完成的比例，由仓库聚合查询。
 *
 * 撤销接入（v1.6.2）：创建/编辑/完成/删除全部在 Service 层捕获快照并推入
 * undoManager；undo/redo 应用期间跳过入栈。删除目标会经 FK/显式解绑把
 * 关联任务 goal_id 置空，因此撤销删除 = 还原目标行 + 恢复任务关联（复合动作）。
 */

/** 目标可撤销字段（排除 sortOrder/createdAt/updatedAt 等系统字段）。 */
export const GOAL_UNDOABLE_FIELDS = [
  "title",
  "description",
  "deadline",
  "startDate",
  "priority",
  "manualProgress",
  "status",
  "completedAt",
] as const;

type GoalUndoableField = (typeof GOAL_UNDOABLE_FIELDS)[number];

/** 从 a → b 的变化字段（供 undo/redo 复用）。schema 的 priority/status 是 string，
 *  领域层为联合类型，故输出以 unknown 记录、提交时收敛为 UpdateGoalInput。 */
function diffGoal(
  a: Goal | null | undefined,
  b: Goal | null | undefined,
): Partial<Record<GoalUndoableField, unknown>> {
  const out: Partial<Record<GoalUndoableField, unknown>> = {};
  if (!a || !b) return out;
  for (const field of GOAL_UNDOABLE_FIELDS) {
    if (a[field] !== b[field]) {
      out[field] = b[field];
    }
  }
  return out;
}

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

  /** 标题模糊搜索（命令面板用）。 */
  async searchTitles(query: string, limit?: number): Promise<Goal[]> {
    if (!query.trim()) return [];
    return this.goals.searchByTitle(query, limit);
  }

  /** 活跃但近期无推进（[from,to) 内无任务完成）的目标 —— 复盘停滞告警。 */
  async listStalled(from: number, to: number): Promise<Array<{ id: number; title: string }>> {
    return this.goals.listActiveStalled(from, to);
  }

  async create(input: CreateGoalInput): Promise<Goal> {
    const goal = await this.goals.create(input);
    if (!undoManager.applying) {
      const snapshot = { ...goal };
      undoManager.push({
        type: "goal.create",
        label: "创建长期任务",
        undo: async () => {
          // 撤销创建：删除该目标（无关联任务，不产生级联）
          await this.goals.delete(snapshot.id);
        },
        redo: async () => {
          // 重做创建：以显式 id 还原同一行
          await this.goals.insertRestored(snapshot);
        },
      });
    }
    return goal;
  }

  async update(id: number, input: UpdateGoalInput): Promise<Goal | null> {
    const before = await this.goals.findById(id);
    const updated = await this.goals.update(id, input);
    if (updated) this.captureGoalUpdate(id, before, updated);
    return updated;
  }

  /** 完成目标（保留数据；重复完成幂等）。 */
  async complete(id: number): Promise<Goal | null> {
    const before = await this.goals.findById(id);
    const updated = await this.goals.complete(id);
    if (updated) this.captureGoalUpdate(id, before, updated);
    return updated;
  }

  /** 捕获一次目标状态变更（before → after）为可撤销动作。 */
  private captureGoalUpdate(
    id: number,
    before: Goal | null,
    after: Goal | null,
  ): void {
    if (undoManager.applying) return;
    if (!before || !after) return;
    const diff = diffGoal(before, after);
    if (Object.keys(diff).length === 0) return;
    undoManager.push({
      type: "goal.update",
      label: "修改长期任务",
      undo: async () => {
        await this.goals.update(id, diffGoal(after, before) as unknown as UpdateGoalInput);
      },
      redo: async () => {
        await this.goals.update(id, diffGoal(before, after) as unknown as UpdateGoalInput);
      },
    });
  }

  /** 删除目标：捕获目标行 + 受影响任务 id，撤销时整体还原。 */
  async delete(id: number): Promise<boolean> {
    if (!undoManager.applying) {
      const goal = await this.goals.findById(id);
      if (goal) {
        const g = { ...goal };
        const taskIds = await this.goals.taskIdsByGoal(id);
        undoManager.push({
          type: "goal.delete",
          label: "删除长期任务",
          undo: async () => {
            await this.goals.insertRestored(g);
            if (taskIds.length > 0) await this.goals.relinkTasks(taskIds, g.id);
          },
          redo: async () => {
            await this.goals.delete(g.id);
          },
        });
      }
    }
    return this.goals.delete(id);
  }
}
