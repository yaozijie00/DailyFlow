import { TaskRepository } from "../db/repositories/taskRepository";
import {
  FocusSessionRepository,
  type FocusSessionAggregate,
} from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { NO_CATEGORY_COLOR } from "../lib/categoryColors";
import {
  startOfTomorrow,
  todayString,
  dateStringOf,
  dateStringToStart,
} from "../lib/date";

export interface TodayStats {
  /** 今日任务总数（不含已取消） */
  totalTasks: number;
  /** 今日完成任务数 */
  completedTasks: number;
  /** 完成率 0..1 */
  completionRate: number;
  /** 今日专注总时长（秒） */
  totalFocusSeconds: number;
  /** 今日专注次数 */
  focusCount: number;
}

export interface RangeStatistics {
  /** 实际投入总时长（秒，含提前结束） */
  totalSeconds: number;
  /** 走满番茄数（completed=true） */
  completedCount: number;
  /** 事件总数（含提前结束） */
  eventCount: number;
}

export interface CategoryStatistic {
  categoryId: number | null;
  name: string;
  color: string;
  seconds: number;
}

export interface DailyStatistic {
  date: string;
  seconds: number;
  completedCount: number;
}

export interface HourlyStatistic {
  hour: number;
  seconds: number;
}

/** 类别已删除时的显示名（category_id 快照 JOIN 不到名称）。 */
export const DELETED_CATEGORY_NAME = "已删除类别";

/**
 * 统计服务。所有统计均由 focus_sessions（WorkEvent）在查询时实时聚合，
 * 不落库任何统计结果（避免冗余数据）。聚合在 service 层完成，UI 只消费结果。
 */
export class StatisticsService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly focusSessions: FocusSessionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  /** 今日五项统计：任务总数 / 完成数 / 完成率 + 专注总时长 / 次数。 */
  async getTodayStats(): Promise<TodayStats> {
    return this.getDateStats(todayString());
  }

  /** 指定日期（YYYY-MM-DD）五项统计：任务按 scheduledDate，专注按 startedAt 所属日期。 */
  async getDateStats(date: string): Promise<TodayStats> {
    const from = dateStringToStart(date);
    const to = Number.isNaN(from) ? startOfTomorrow() : from + 86_400_000;
    const [taskStats, focusStats] = await Promise.all([
      this.tasks.countTodayStats(date),
      this.focusSessions.getTodayStats(from, to),
    ]);
    const totalTasks = taskStats.total;
    return {
      totalTasks,
      completedTasks: taskStats.completed,
      completionRate: totalTasks === 0 ? 0 : taskStats.completed / totalTasks,
      totalFocusSeconds: focusStats.totalSeconds,
      focusCount: focusStats.count,
    };
  }

  /** [from, to) 内的汇总：总时长 / 走满数 / 事件数。 */
  async getRangeStatistics(from: number, to: number): Promise<RangeStatistics> {
    const rows = await this.focusSessions.listInRange(from, to);
    return aggregateRange(rows);
  }

  /** [from, to) 内按类别聚合投入时长，按时长降序；已删除类别归入「已删除类别」。 */
  async getCategoryStatistics(
    from: number,
    to: number,
  ): Promise<CategoryStatistic[]> {
    const [rows, cats] = await Promise.all([
      this.focusSessions.listInRange(from, to),
      this.categories.findAll(),
    ]);
    const nameById = new Map(cats.map((c) => [c.id, c.name]));
    const colorById = new Map(cats.map((c) => [c.id, c.color]));
    const byId = new Map<number | null, number>();
    for (const r of rows) {
      const key = r.categoryId;
      byId.set(key, (byId.get(key) ?? 0) + r.actualDuration);
    }
    const result: CategoryStatistic[] = [];
    for (const [categoryId, seconds] of byId.entries()) {
      const known = categoryId != null && nameById.has(categoryId);
      result.push({
        categoryId,
        name: known ? nameById.get(categoryId)! : DELETED_CATEGORY_NAME,
        color: known ? (colorById.get(categoryId) ?? NO_CATEGORY_COLOR) : NO_CATEGORY_COLOR,
        seconds,
      });
    }
    result.sort((a, b) => b.seconds - a.seconds);
    return result;
  }

  /** [from, to) 内按本地日期聚合，返回按日期升序。 */
  async getDailyStatistics(from: number, to: number): Promise<DailyStatistic[]> {
    const rows = await this.focusSessions.listInRange(from, to);
    const byDate = new Map<string, { seconds: number; completedCount: number }>();
    for (const r of rows) {
      const date = dateStringOf(r.startedAt);
      const cur = byDate.get(date) ?? { seconds: 0, completedCount: 0 };
      cur.seconds += r.actualDuration;
      if (r.completed) cur.completedCount += 1;
      byDate.set(date, cur);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, seconds: v.seconds, completedCount: v.completedCount }));
  }

  /** [from, to) 内按开始小时聚合，返回完整 0..23（无数据为 0）。 */
  async getHourlyStatistics(from: number, to: number): Promise<HourlyStatistic[]> {
    const rows = await this.focusSessions.listInRange(from, to);
    const buckets = new Array<number>(24).fill(0);
    for (const r of rows) {
      buckets[new Date(r.startedAt).getHours()] += r.actualDuration;
    }
    return buckets.map((seconds, hour) => ({ hour, seconds }));
  }
}

/** 纯函数：由事件列表聚合出范围汇总（供统计/成就复用）。 */
export function aggregateRange(rows: FocusSessionAggregate[]): RangeStatistics {
  let totalSeconds = 0;
  let completedCount = 0;
  for (const r of rows) {
    totalSeconds += r.actualDuration;
    if (r.completed) completedCount += 1;
  }
  return { totalSeconds, completedCount, eventCount: rows.length };
}
