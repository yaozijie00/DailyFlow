import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { AchievementProgressRepository } from "../db/repositories/achievementProgressRepository";
import { dateStringOf } from "../lib/date";
import {
  ConditionEngine,
  type AchievementContext,
  type Progress,
} from "../achievements/conditionEngine";
import type { AchievementDefinition } from "../achievements/definitions";

/** 成就进度视图：定义 + 进度 + 解锁态，UI 只消费它。 */
export interface AchievementProgressView extends AchievementDefinition, Progress {
  unlocked: boolean;
  unlockedAt: number | null;
}

/**
 * 连续工作天数：从今天（本地日期）往前数，连续每天都有 ≥1 个走满番茄。
 * 独立纯函数，便于测试。
 */
export function computeStreakDays(
  completedDays: Set<string>,
  now: Date = new Date(),
): number {
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (completedDays.has(dateStringOf(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * 成就服务：基于 WorkEvent（focus_sessions）聚合上下文 → 条件评估 → 解锁持久化。
 * 新增普通成就只需在 achievements/*.json 加配置，无需改此文件。
 */
export class AchievementService {
  constructor(
    private readonly definitions: AchievementDefinition[],
    private readonly progress: AchievementProgressRepository,
    private readonly sessions: FocusSessionRepository,
    private readonly categories: CategoryRepository,
    private readonly tasks: TaskRepository,
  ) {}

  /** 聚合全部 WorkEvent + 任务数据构建评估上下文（实时计算，不落库）。 */
  async buildContext(): Promise<AchievementContext> {
    const [rows, cats, allTasks] = await Promise.all([
      this.sessions.listAll(),
      this.categories.findAll(),
      this.tasks.findAll(),
    ]);
    const nameById = new Map(cats.map((c) => [c.id, c.name]));

    let completedCount = 0;
    let totalDurationSeconds = 0;
    let maxDailyDurationSeconds = 0;
    const categoryDurations = new Map<string, number>();
    const distinctNames = new Set<string>();
    const dailyByDate = new Map<string, number>();
    const completedDays = new Set<string>();

    for (const r of rows) {
      totalDurationSeconds += r.actualDuration;
      const date = dateStringOf(r.startedAt);
      dailyByDate.set(date, (dailyByDate.get(date) ?? 0) + r.actualDuration);
      if (r.completed) {
        completedCount += 1;
        completedDays.add(date);
      }
      if (r.categoryId != null) {
        const name = nameById.get(r.categoryId);
        if (name) {
          categoryDurations.set(name, (categoryDurations.get(name) ?? 0) + r.actualDuration);
          distinctNames.add(name);
        }
      }
    }
    for (const v of dailyByDate.values()) {
      if (v > maxDailyDurationSeconds) maxDailyDurationSeconds = v;
    }

    // 任务维度（不含已取消；计划 = plannedStart != null）
    let completedTasks = 0;
    let maxDailyCompletedTasks = 0;
    let plannedTasks = 0;
    let completedPlannedTasks = 0;
    const completedByDate = new Map<string, number>();
    for (const t of allTasks) {
      if (t.status === "CANCELLED") continue;
      if (t.plannedStart != null) plannedTasks += 1;
      if (t.status === "COMPLETED") {
        completedTasks += 1;
        if (t.plannedStart != null) completedPlannedTasks += 1;
        const date = dateStringOf(t.completedAt ?? t.updatedAt);
        completedByDate.set(date, (completedByDate.get(date) ?? 0) + 1);
      }
    }
    for (const v of completedByDate.values()) {
      if (v > maxDailyCompletedTasks) maxDailyCompletedTasks = v;
    }

    return {
      completedCount,
      totalDurationSeconds,
      categoryDurations,
      maxDailyDurationSeconds,
      streakDays: computeStreakDays(completedDays),
      distinctCategories: distinctNames.size,
      completedTasks,
      maxDailyCompletedTasks,
      plannedTasks,
      completedPlannedTasks,
      categoryNames: cats.map((c) => c.name),
      createdTasks: allTasks.length,
    };
  }

  /** 评估全部成就，持久化新解锁（幂等），返回本次新解锁的成就。 */
  async evaluate(): Promise<AchievementDefinition[]> {
    const ctx = await this.buildContext();
    const progress = await this.progress.findAll();
    const unlockedIds = new Set(
      progress.filter((p) => p.unlocked).map((p) => p.achievementId),
    );
    const newly: AchievementDefinition[] = [];
    for (const def of this.definitions) {
      if (unlockedIds.has(def.id)) continue;
      if (ConditionEngine.evaluate(def.condition, ctx)) {
        await this.progress.markUnlocked(def.id, Date.now());
        unlockedIds.add(def.id);
        newly.push(def);
      }
    }
    return newly;
  }

  /** 全部成就进度视图（含未解锁），供成就页展示。 */
  async getProgressList(): Promise<AchievementProgressView[]> {
    const [ctx, progress] = await Promise.all([
      this.buildContext(),
      this.progress.findAll(),
    ]);
    const unlockedMap = new Map(progress.map((p) => [p.achievementId, p]));
    return this.definitions.map((def) => {
      const prog = ConditionEngine.getProgress(def.condition, ctx);
      const p = unlockedMap.get(def.id);
      return {
        ...def,
        ...prog,
        unlocked: p?.unlocked ?? false,
        unlockedAt: p?.unlockedAt ?? null,
      };
    });
  }

  /**
   * 渐进式可见成就：已解锁全部显示；每个成就链（或无链的独立成就）只显示
   * 「当前下一个未解锁」的一个，后续未解锁的完全隐藏（不泄露未来成就信息）。
   */
  async getVisibleAchievements(): Promise<AchievementProgressView[]> {
    const list = await this.getProgressList();
    const groups = new Map<string, AchievementProgressView[]>();
    for (const item of list) {
      const key = item.chainId ?? `__single__${item.id}`;
      const arr = groups.get(key);
      if (arr) arr.push(item);
      else groups.set(key, [item]);
    }
    const visible: AchievementProgressView[] = [];
    for (const group of groups.values()) {
      group.sort((a, b) => a.order - b.order);
      let foundNext = false;
      for (const item of group) {
        if (item.unlocked) {
          visible.push(item);
        } else if (!foundNext) {
          visible.push(item); // 当前可追求的下一个
          foundNext = true;
        }
      }
    }
    return visible;
  }

  /** 已解锁成就（含进度），供「已解锁」过滤视图。 */
  async getUnlockedAchievements(): Promise<AchievementProgressView[]> {
    const list = await this.getProgressList();
    return list.filter((i) => i.unlocked);
  }

  /** 成就链分组（chainId → 按 order 排序的成就），供分组展示。 */
  async getAchievementChains(): Promise<Map<string, AchievementProgressView[]>> {
    const list = await this.getProgressList();
    const groups = new Map<string, AchievementProgressView[]>();
    for (const item of list) {
      if (!item.chainId) continue;
      const arr = groups.get(item.chainId);
      if (arr) arr.push(item);
      else groups.set(item.chainId, [item]);
    }
    for (const group of groups.values()) group.sort((a, b) => a.order - b.order);
    return groups;
  }

  /** 某成就链当前可追求的下一个（未解锁中的最小 order）；无则 null。 */
  async getCurrentAchievementByChain(chainId: string): Promise<AchievementProgressView | null> {
    const chains = await this.getAchievementChains();
    const group = chains.get(chainId);
    if (!group) return null;
    return group.find((i) => !i.unlocked) ?? null;
  }

  /** 某成就是否已解锁（persisted）。 */
  async isAchievementUnlocked(id: string): Promise<boolean> {
    const row = await this.progress.findById(id);
    return row?.unlocked === true;
  }

  /** 某成就进度视图；定义不存在返回 null。 */
  async getAchievementProgress(id: string): Promise<AchievementProgressView | null> {
    const list = await this.getProgressList();
    return list.find((i) => i.id === id) ?? null;
  }
}
