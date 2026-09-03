import { useEffect } from "react";
import Layout from "./components/Layout";
import CloseBehaviorDialog from "./components/settings/CloseBehaviorDialog";
import { useAppStore } from "./stores/appStore";
import { useSettingsStore } from "./stores/settingsStore";
import { usePomodoroStore } from "./stores/pomodoroStore";
import { useGoalStore } from "./stores/goalStore";
import Today from "./pages/Today";
import Focus from "./pages/Focus";
import Goals from "./pages/Goals";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import { useShortcuts } from "./hooks/useShortcuts";
import { databaseService } from "./services/databaseService";
import { initWindowBehavior } from "./services/windowBehaviorService";
import { undoManager } from "./lib/undoManager";

const pages = {
  today: Today,
  focus: Focus,
  goals: Goals,
  statistics: Statistics,
  settings: Settings,
} as const;

function App() {
  useShortcuts();
  const currentPage = useAppStore((s) => s.currentPage);
  const setDbStatus = useAppStore((s) => s.setDbStatus);
  const dbStatus = useAppStore((s) => s.dbStatus);
  const undoLimit = useSettingsStore((s) => s.settings.undoHistoryLimit);
  const Page = pages[currentPage];

  // 撤销历史上限：跟随设置（默认 50），修改后立即生效
  useEffect(() => {
    undoManager.setMaxHistory(undoLimit);
  }, [undoLimit]);

  // 界面密度：写入 <html data-density>，供全局 CSS 变量（nav-row/task-row 密度）
  const density = useSettingsStore((s) => s.settings.density);
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // 窗口行为（关闭拦截 / 托盘「开始暂停专注」）监听
  useEffect(() => initWindowBehavior(), []);

  useEffect(() => {
    databaseService.init().then((result) => {
      setDbStatus(result.ok ? "ready" : "error", result.error ?? null);
    });
  }, [setDbStatus]);

  // 数据库就绪后加载设置（时间轴范围/吸附、番茄钟时长）
  useEffect(() => {
    if (dbStatus === "ready") {
      useSettingsStore.getState().load();
      // 加载长期目标（供「长期」页与任务表单的「关联目标」下拉使用）
      useGoalStore.getState().load();
      // 恢复进行中的专注（若存在未结束的 focus_session）
      usePomodoroStore.getState().restoreActiveFocus().catch(() => {});
    }
  }, [dbStatus]);

  return (
    <Layout>
      <Page />
      <CloseBehaviorDialog />
    </Layout>
  );
}

export default App;
