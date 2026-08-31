import { useEffect } from "react";
import Layout from "./components/Layout";
import { useAppStore } from "./stores/appStore";
import { useSettingsStore } from "./stores/settingsStore";
import { usePomodoroStore } from "./stores/pomodoroStore";
import { useGoalStore } from "./stores/goalStore";
import Today from "./pages/Today";
import Focus from "./pages/Focus";
import News from "./pages/News";
import Goals from "./pages/Goals";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import { useShortcuts } from "./hooks/useShortcuts";
import { databaseService } from "./services/databaseService";

const pages = {
  today: Today,
  focus: Focus,
  news: News,
  goals: Goals,
  statistics: Statistics,
  settings: Settings,
} as const;

function App() {
  useShortcuts();
  const currentPage = useAppStore((s) => s.currentPage);
  const setDbStatus = useAppStore((s) => s.setDbStatus);
  const dbStatus = useAppStore((s) => s.dbStatus);
  const Page = pages[currentPage];

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
    </Layout>
  );
}

export default App;
