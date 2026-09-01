import { create } from "zustand";
import { getDb } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
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
  dateStringToStart,
  todayString,
} from "../lib/date";

export type RangePreset = "today" | "days7" | "days30" | "all" | "custom";

/** 「统计」页顶层 Tab：统计 / 成就（成就由快捷键与 Tab 切换进入）。 */
export type StatsTab = "statistics" | "achievements";

const statisticsService = new StatisticsService(
  new TaskRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
);

/** 纯函数：预设 → 时间范围 [from, to)。custom 用 from/to 的 YYYY-MM-DD（含 to 当日）。 */
export function computeRange(
  range: RangePreset,
  customFrom: string,
  customTo: string,
): { from: number; to: number } {
  switch (range) {
    case "today":
      return { from: startOfToday(), to: startOfTomorrow() };
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
    set({ loading: true });
    try {
      const [rangeStats, categoryStats, hourlyStats, overview, dailyTasks] = await Promise.all([
        statisticsService.getRangeStatistics(from, to),
        statisticsService.getCategoryStatistics(from, to),
        range === "today"
          ? statisticsService.getHourlyStatistics(from, to)
          : Promise.resolve([] as HourlyStatistic[]),
        statisticsService.getOverview(from, to),
        statisticsService.getDailyTasks(from, to),
      ]);
      set({ rangeStats, categoryStats, hourlyStats, overview, dailyTasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
