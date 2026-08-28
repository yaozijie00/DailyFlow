import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { startOfToday, startOfTomorrow, todayString } from "../lib/date";

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

/**
 * 统计服务。所有统计均由 SQLite 原始数据在查询时实时聚合，
 * 不落库任何统计结果（避免冗余数据）。
 */
export class StatisticsService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly focusSessions: FocusSessionRepository,
  ) {}

  /** 今日五项统计：任务总数 / 完成数 / 完成率 + 专注总时长 / 次数。 */
  async getTodayStats(): Promise<TodayStats> {
    const [taskStats, focusStats] = await Promise.all([
      this.tasks.countTodayStats(todayString()),
      this.focusSessions.getTodayStats(startOfToday(), startOfTomorrow()),
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

  /** 今日专注总时长（秒）。 */
  async getTodayFocusDuration(): Promise<number> {
    return this.focusSessions.getTotalActualDuration(
      startOfToday(),
      startOfTomorrow(),
    );
  }
}
