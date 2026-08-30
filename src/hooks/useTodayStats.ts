import { useEffect, useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { usePomodoroStore } from "../stores/pomodoroStore";
import { getDb } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { StatisticsService, type TodayStats } from "../services/statisticsService";

const statisticsService = new StatisticsService(
  new TaskRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
);

/**
 * 某日统计（默认跟随 Today 页 selectedDate）：数据变化后立即重新从 SQLite 实时聚合。
 *
 * 触发重算的信号：
 * - taskStore.tasks：所有任务增删改/完成/取消都会经过 load() 换新数组；
 * - pomodoroStore.focusVersion：专注会话落库（开始/结束）后自增；
 * - taskStore.selectedDate：切换查看日期后按该日期聚合。
 */
export function useTodayStats(): TodayStats | null {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const tasks = useTaskStore((s) => s.tasks);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const focusVersion = usePomodoroStore((s) => s.focusVersion);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);

  // 每分钟轻量刷新：跨午夜时日期变化能自动反映（B10）
  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    let cancelled = false;
    statisticsService
      .getDateStats(selectedDate)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // 查询失败保持上一次结果，不崩溃
      });
    return () => {
      cancelled = true;
    };
  }, [dbStatus, tasks, focusVersion, minuteTick, selectedDate]);

  return stats;
}
