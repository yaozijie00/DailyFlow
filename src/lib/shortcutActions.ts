import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../stores/appStore";
import { usePomodoroStore } from "../stores/pomodoroStore";
import { useTaskStore } from "../stores/taskStore";
import { useNewsStore } from "../stores/newsStore";
import { useStatisticsStore } from "../stores/statisticsStore";
import type { ShortcutAction } from "./shortcuts";

/** 执行快捷键动作（所有副作用走 store getState，便于测试）。 */
export function dispatchShortcut(action: ShortcutAction): void {
  const app = useAppStore.getState();
  switch (action) {
    case "open_dailyflow":
      void getCurrentWindow().show();
      void getCurrentWindow().unminimize();
      void getCurrentWindow().setFocus();
      break;
    case "create_task":
      app.setPage("today");
      useTaskStore.getState().openCreate();
      break;
    case "pomodoro_toggle": {
      const p = usePomodoroStore.getState();
      if (p.snapshot.state === "RUNNING") p.pause();
      else if (p.snapshot.state === "PAUSED") p.resume();
      else app.pushToast("info", "请先在「专注」页选择任务开始番茄钟");
      break;
    }
    case "complete_task": {
      const t = useTaskStore.getState();
      if (t.selectedTaskId == null) app.pushToast("info", "请先选中一个任务");
      else void t.completeTask(t.selectedTaskId);
      break;
    }
    case "open_today":
      app.setPage("today");
      break;
    case "open_focus":
      app.setPage("focus");
      break;
    case "open_news":
      app.setPage("news");
      break;
    case "refresh_news":
      app.setPage("news");
      void useNewsStore.getState().refresh();
      break;
    case "open_statistics":
      useStatisticsStore.getState().setTab("statistics");
      app.setPage("statistics");
      break;
    case "open_achievements":
      // 成就已并入「统计」页的「成就」Tab
      useStatisticsStore.getState().setTab("achievements");
      app.setPage("statistics");
      break;
    case "open_settings":
      app.setPage("settings");
      break;
  }
}
