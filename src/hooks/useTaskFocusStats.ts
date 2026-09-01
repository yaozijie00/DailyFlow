import { useEffect, useState } from "react";
import { taskService } from "../stores/taskStore";
import { usePomodoroStore } from "../stores/pomodoroStore";

export interface TaskFocusStats {
  totalSeconds: number;
  count: number;
  completedCount: number;
}

const EMPTY: TaskFocusStats = { totalSeconds: 0, count: 0, completedCount: 0 };

/**
 * 任务维度的专注汇总（详情面板只读数据）：
 * 通过 Service 单次查询聚合，不在组件内做 SQL；依赖 focusVersion 在专注落库后自动刷新。
 */
export function useTaskFocusStats(taskId: number | null): TaskFocusStats {
  const focusVersion = usePomodoroStore((s) => s.focusVersion);
  const [stats, setStats] = useState<TaskFocusStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (taskId == null) {
      setStats(EMPTY);
      return;
    }
    void taskService
      .getTaskFocusStats(taskId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        if (!cancelled) setStats(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, focusVersion]);

  return stats;
}
