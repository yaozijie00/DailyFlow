import { create } from "zustand";
import { getDb } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { WorkflowMetricsRepository } from "../db/repositories/workflowMetricsRepository";
import type { WorkflowExecutionAggregate } from "../db/repositories/workflowMetricsRepository";
import {
  StatisticsService,
  type RangeStatistics,
  type CategoryStatistic,
  type HourlyStatistic,
  type OverviewStatistics,
  type DailyTasksByDate,
} from "../services/statisticsService";
import {
  startOfToday,
  startOfTomorrow,
  startOfWeek,
  dateStringToStart,
  todayString,
} from "../lib/date";

export type RangePreset = "today" | "week" | "days7" | "days30" | "all" | "custom";

/** 「统计」页顶层 Tab：统计 / 复盘 / 成就。 */
export type StatsTab = "statistics" | "review" | "achievements";

const statisticsService = new StatisticsService(
  new TaskRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
  new WorkflowMetricsRepository(getDb()),
);

/** 共享统计服务单例（复盘视图等只读查询复用）。 */
export { statisticsService };

/** load 请求序号（A1-P0Fix-④）：丢弃过期异步响应。 */
let statLoadSeq = 0;

/** 纯函数：预设 → 时间范围 [from, to)。custom 用 from/to 的 YYYY-MM-DD（含 to 当日）。 */
export function computeRange(
  range: RangePreset,
  customFrom: string,
  customTo: string,
): { from: number; to: number } {
  switch (range) {
    case "today":
      return { from: startOfToday(), to: startOfTomorrow() };
    case "week":
      // 自然周（周一起始）→ 明天，复盘「本周」直觉口径
      return { from: startOfWeek(), to: startOfTomorrow() };
    case "days7": {
      const from = startOfToday() - 6 * 86_400_000; // 含今天共 7 天
      return { from, to: startOfTomorrow() };
    }
    case "days30": {
      const from = startOfToday() - 29 * 86_400_000; // 含今天共 30 天
      return { from, to: startOfTomorrow() };
    }
    case "all":
      return { from: 0, to: startOfTomorrow() };
    case "custom": {
      const from = dateStringToStart(customFrom);
      const to = dateStringToStart(customTo);
      if (Number.isNaN(from) || Number.isNaN(to)) {
        return { from: startOfToday(), to: startOfTomorrow() };
      }
      return { from, to: to + 86_400_000 };
    }
  }
}

interface StatisticsState {
  /** 顶层 Tab（统计/成就） */
  tab: StatsTab;
  range: RangePreset;
  customFrom: string;
  customTo: string;
  loading: boolean;
  rangeStats: RangeStatistics | null;
  categoryStats: CategoryStatistic[];
  hourlyStats: HourlyStatistic[];
  overview: OverviewStatistics | null;
  dailyTasks: DailyTasksByDate[];
  /** A6：Workflow 执行指标（无数据为 null） */
  workflowExecution: WorkflowExecutionAggregate | null;
  setTab: (t: StatsTab) => void;
  setRange: (r: RangePreset) => void;
  setCustomRange: (from: string, to: string) => void;
  load: () => Promise<void>;
}

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  tab: "statistics",
  range: "today",
  customFrom: todayString(),
  customTo: todayString(),
  loading: false,
  rangeStats: null,
  categoryStats: [],
  hourlyStats: [],
  overview: null,
  dailyTasks: [],
  workflowExecution: null,

  setTab: (t) => {
    set({ tab: t });
  },

  setRange: (r) => {
    set({ range: r });
    void get().load();
  },

  setCustomRange: (from, to) => {
    set({ customFrom: from, customTo: to });
    void get().load();
  },

  load: async () => {
    const { range, customFrom, customTo } = get();
    const { from, to } = computeRange(range, customFrom, customTo);
    const seq = ++statLoadSeq; // A1-P0Fix-④：丢弃过期响应（快速切换范围时旧查询不覆盖新范围）
    set({ loading: true });
    try {
      const [rangeStats, categoryStats, hourlyStats, overview, dailyTasks, workflowExecution] =
        await Promise.all([
          statisticsService.getRangeStatistics(from, to),
          statisticsService.getCategoryStatistics(from, to),
          range === "today"
            ? statisticsService.getHourlyStatistics(from, to)
            : Promise.resolve([] as HourlyStatistic[]),
          statisticsService.getOverview(from, to),
          statisticsService.getDailyTasks(from, to),
          statisticsService.getWorkflowExecution(from, to),
        ]);
      if (seq !== statLoadSeq) return; // 已有更新的 load 发起 → 丢弃本次
      set({ rangeStats, categoryStats, hourlyStats, overview, dailyTasks, workflowExecution, loading: false });
    } catch {
      if (seq === statLoadSeq) set({ loading: false });
    }
  },
}));
