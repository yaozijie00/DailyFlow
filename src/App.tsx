import { useEffect, useRef } from "react";
import Layout from "./components/Layout";
import CloseBehaviorDialog from "./components/settings/CloseBehaviorDialog";
import { useAppStore, type CorePage } from "./stores/appStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useExtensionStore } from "./stores/extensionStore";
import { usePomodoroStore } from "./stores/pomodoroStore";
import { useGoalStore } from "./stores/goalStore";
import { getExtensionPageFor, ExtensionErrorBoundary } from "./extensions/host";
import { createCoreContext } from "./extensions/context";
import Today from "./pages/Today";
import Focus from "./pages/Focus";
import Goals from "./pages/Goals";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import { useShortcuts } from "./hooks/useShortcuts";
import { databaseService } from "./services/databaseService";
import { initWindowBehavior } from "./services/windowBehaviorService";
import { undoManager } from "./lib/undoManager";
import { useLayoutModeStore } from "./lib/layoutMode";

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
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const defaultPage = useSettingsStore((s) => s.settings.defaultPage);
  const bootPageAppliedRef = useRef(false);
  const corePage = pages[currentPage as CorePage];
  const extPage = !corePage ? getExtensionPageFor(currentPage) : null;
  const ActivePage = corePage ?? extPage;
  const isExtensionPage = !corePage && extPage != null;

  // 启动默认页：设置加载完成后一次性跳转（仅首次；之后手动导航/改设置不干扰）
  useEffect(() => {
    if (!settingsLoaded || bootPageAppliedRef.current) return;
    bootPageAppliedRef.current = true;
    if (defaultPage !== "today" && defaultPage !== currentPage) {
      useAppStore.getState().setPage(defaultPage);
    }
  }, [settingsLoaded, defaultPage, currentPage]);

  // 撤销历史上限：跟随设置（默认 50），修改后立即生效
  useEffect(() => {
    undoManager.setMaxHistory(undoLimit);
  }, [undoLimit]);

  // A3：设置里的「默认视图模式」→ 会话级 current（切换器改动不写回，仅「设为默认」更新）
  const layoutModeSyncedRef = useRef(false);
  useEffect(() => {
    // 仅在设置首次加载完成时把默认模式作为会话基底；之后用户切过则不再覆盖
    if (!settingsLoaded || layoutModeSyncedRef.current) return;
    layoutModeSyncedRef.current = true;
    useLayoutModeStore.getState().setCurrent(useSettingsStore.getState().settings.defaultLayoutMode);
  }, [settingsLoaded]);

  // 窗口行为（关闭拦截 / 托盘「开始暂停专注」）监听
  useEffect(() => initWindowBehavior(), []);

  useEffect(() => {
    databaseService.init().then((result) => {
      setDbStatus(result.ok ? "ready" : "error", result.error ?? null);
    });
  }, [setDbStatus]);

  // 数据库就绪后加载设置与 Extension（加载失败不阻塞启动；错误在「设置 → 扩展」展示）
  useEffect(() => {
    if (dbStatus === "ready") {
      useSettingsStore.getState().load();
      useExtensionStore.getState().init(createCoreContext()).catch(() => {});
      // 加载长期目标（供「长期」页与任务表单的「关联目标」下拉使用）
      useGoalStore.getState().load();
      // 恢复进行中的专注（若存在未结束的 focus_session）
      usePomodoroStore.getState().restoreActiveFocus().catch(() => {});
    }
  }, [dbStatus]);

  return (
    <Layout>
      {ActivePage ? (
        isExtensionPage ? (
          <ExtensionErrorBoundary label={currentPage}>
            <ActivePage />
          </ExtensionErrorBoundary>
        ) : (
          <ActivePage />
        )
      ) : (
        <div className="text-sm text-text-faint">页面不存在</div>
      )}
      <CloseBehaviorDialog />
    </Layout>
  );
}

export default App;
