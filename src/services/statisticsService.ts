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
  /** 会话次数 */
  count: number;
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

/** 每日任务列表项（统计页「每日任务」用）。 */
export interface DailyTaskItem {
  id: number;
  title: string;
  status: string;
}

/** 按日期分组的任务列表。 */
export interface DailyTasksByDate {
  date: string;
  tasks: DailyTaskItem[];
}

export interface OverviewStatistics {
  /** 总 Focus 时间（秒，含提前结束） */
  totalSeconds: number;
  /** Focus 会话次数（含提前结束） */
  sessionCount: number;
  /** 走满番茄数 */
  completedFocusCount: number;
  /** 平均每次 Focus 时长（秒） */
  avgSessionSeconds: number;
  /** 平均每日投入（秒） */
  avgDailySeconds: number;
  /** 最常工作的类别名（无数据为 null） */
  topCategory: string | null;
  /** 区间内创建的任务数 */
  taskCreated: number;
  /** 区间内完成的任务数（completedAt 落在区间） */
  taskCompleted: number;
  /** 区间内创建且未完成（不含已取消） */
  taskIncomplete: number;
  /** 完成率 0..1（创建的任务中已完成占比，不含已取消） */
  completionRate: number;
  /** 各类别投入（含会话次数） */
  categoryStats: CategoryStatistic[];
  /** 每日 Focus 投入（升序） */
  dailyFocus: DailyStatistic[];
  /** 每日完成任务数（升序） */
  dailyCompletedTasks: { date: string; count: number }[];
  /** 区间内完成任务数（预计>0 或实际>0，预计 vs 实际 对比样本） */
  estimateRowCount: number;
  /** 区间内完成任务预计时长合计（秒，estimatedDuration） */
  estimatedTotalSeconds: number;
  /** 区间内完成任务实际专注合计（秒，task.actualDuration 累计） */
  actualTotalSeconds: number;
  /** 逐项对比（预计 vs 实际），按偏差绝对值降序 */
  estimateRows: { title: string; estimatedSeconds: number; actualSeconds: number }[];
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

  /** [from, to) 内按类别聚合投入时长与次数，按时长降序；已删除类别归入「已删除类别」。 */
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
    const byId = new Map<number | null, { seconds: number; count: number }>();
    for (const r of rows) {
      const key = r.categoryId;
      const cur = byId.get(key) ?? { seconds: 0, count: 0 };
      cur.seconds += r.actualDuration;
      cur.count += 1;
      byId.set(key, cur);
    }
    const result: CategoryStatistic[] = [];
    for (const [categoryId, v] of byId.entries()) {
      const known = categoryId != null && nameById.has(categoryId);
      result.push({
        categoryId,
        name: known ? nameById.get(categoryId)! : DELETED_CATEGORY_NAME,
        color: known ? (colorById.get(categoryId) ?? NO_CATEGORY_COLOR) : NO_CATEGORY_COLOR,
        seconds: v.seconds,
        count: v.count,
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

  /**
   * 每日任务（统计页「每日任务」）：按 scheduledDate 范围查询任务并按日期分组。
   * 今日 → 当天任务；近7天/近30天/全部/自定义 → 按日期分组列表。
   */
  async getDailyTasks(from: number, to: number): Promise<DailyTasksByDate[]> {
    const fromDate = dateStringOf(from);
    const toDate = dateStringOf(to);
    const rows = await this.tasks.listInDateRange(fromDate, toDate);
    const map = new Map<string, DailyTaskItem[]>();
    for (const t of rows) {
      const arr = map.get(t.scheduledDate) ?? [];
      arr.push({ id: t.id, title: t.title, status: t.status });
      map.set(t.scheduledDate, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({ date, tasks }));
  }

  /**
   * 统计总览（Productivity Overview）：一次数据读取 + Service 聚合。
   * 涵盖 Focus 投入、任务完成、类别分布、每日趋势、平均值。
   */
  async getOverview(from: number, to: number): Promise<OverviewStatistics> {
    const [rows, cats, created, completedRows, completedTasks] = await Promise.all([
      this.focusSessions.listInRange(from, to),
      this.categories.findAll(),
      this.tasks.countCreatedInRange(from, to),
      this.tasks.listCompletedInRange(from, to),
      this.tasks.listCompletedTasksInRange(from, to),
    ]);
    const nameById = new Map(cats.map((c) => [c.id, c.name]));
    const colorById = new Map(cats.map((c) => [c.id, c.color]));

    // Focus 维度
    let totalSeconds = 0;
    let completedFocusCount = 0;
    const byDate = new Map<string, { seconds: number; completedCount: number }>();
    const catMap = new Map<number | null, { seconds: number; count: number }>();
    for (const r of rows) {
      totalSeconds += r.actualDuration;
      if (r.completed) completedFocusCount += 1;
      const date = dateStringOf(r.startedAt);
      const cur = byDate.get(date) ?? { seconds: 0, completedCount: 0 };
      cur.seconds += r.actualDuration;
      if (r.completed) cur.completedCount += 1;
      byDate.set(date, cur);
      const c = catMap.get(r.categoryId) ?? { seconds: 0, count: 0 };
      c.seconds += r.actualDuration;
      c.count += 1;
      catMap.set(r.categoryId, c);
    }
    const dailyFocus = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, seconds: v.seconds, completedCount: v.completedCount }));

    const categoryStats: CategoryStatistic[] = [];
    for (const [categoryId, v] of catMap.entries()) {
      const known = categoryId != null && nameById.has(categoryId);
      categoryStats.push({
        categoryId,
        name: known ? nameById.get(categoryId)! : DELETED_CATEGORY_NAME,
        color: known ? (colorById.get(categoryId) ?? NO_CATEGORY_COLOR) : NO_CATEGORY_COLOR,
        seconds: v.seconds,
        count: v.count,
      });
    }
    categoryStats.sort((a, b) => b.seconds - a.seconds);
    const topCategory = categoryStats.length > 0 ? categoryStats[0].name : null;

    // 任务维度
    const taskCompleted = completedRows.length;
    const taskCreated = created.total;
    const eligibleCreated = Math.max(0, created.total - created.cancelled);
    const completionRate = eligibleCreated === 0 ? 0 : created.completed / eligibleCreated;
    const taskIncomplete = Math.max(0, created.total - created.completed - created.cancelled);

    const dailyByDate = new Map<string, number>();
    for (const r of completedRows) {
      const date = dateStringOf(r.completedAt ?? 0);
      dailyByDate.set(date, (dailyByDate.get(date) ?? 0) + 1);
    }
    const dailyCompletedTasks = Array.from(dailyByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // 预计 vs 实际（核心复盘能力）：仅统计「预计>0 或 实际>0」的已完成任务，
    // 实际取任务累计 actualDuration（真实 Focus Session 落库值，不推算）。
    let estimatedTotalSeconds = 0;
    let actualTotalSeconds = 0;
    const estimateRows: OverviewStatistics["estimateRows"] = [];
    for (const t of completedTasks) {
      const est = t.estimatedDuration ?? 0;
      const act = t.actualDuration ?? 0;
      estimatedTotalSeconds += est;
      actualTotalSeconds += act;
      if (est > 0 || act > 0) {
        estimateRows.push({ title: t.title, estimatedSeconds: est, actualSeconds: act });
      }
    }
    estimateRows.sort(
      (a, b) =>
        Math.abs(b.actualSeconds - b.estimatedSeconds) -
        Math.abs(a.actualSeconds - a.estimatedSeconds),
    );

    const days = Math.max(1, Math.ceil((to - from) / 86_400_000));
    return {
      totalSeconds,
      sessionCount: rows.length,
      completedFocusCount,
      avgSessionSeconds: rows.length === 0 ? 0 : Math.round(totalSeconds / rows.length),
      avgDailySeconds: Math.round(totalSeconds / days),
      topCategory,
      taskCreated,
      taskCompleted,
      taskIncomplete,
      completionRate,
      categoryStats,
      dailyFocus,
      dailyCompletedTasks,
      estimateRowCount: estimateRows.length,
      estimatedTotalSeconds,
      actualTotalSeconds,
      estimateRows,
    };
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
