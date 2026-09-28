import { lazy, Suspense, useEffect, useRef } from "react";
import { MotionConfig, motion } from "motion/react";
import Layout from "./components/Layout";
import CloseBehaviorDialog from "./components/settings/CloseBehaviorDialog";
import { useAppStore, type CorePage } from "./stores/appStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useExtensionStore } from "./stores/extensionStore";
import { FocusBridge } from "./features/focus/FocusController";
import { useFocusStore } from "./features/focus/focusStore";
import { useGoalStore } from "./stores/goalStore";
import { getExtensionPageFor, ExtensionErrorBoundary } from "./extensions/host";
import { createCoreContext } from "./extensions/context";
import { useShortcuts } from "./hooks/useShortcuts";
import { databaseService } from "./services/databaseService";
import { initWindowBehavior } from "./services/windowBehaviorService";
import { measureStartupPhase } from "./services/startupDiagnostics";
import { undoManager } from "./lib/undoManager";
import { useLayoutModeStore } from "./lib/layoutMode";
import { motionTiming } from "./design-system/motion";

const pages = {
  today: lazy(() => import("./pages/Today")),
  focus: lazy(() => import("./pages/Focus")),
  goals: lazy(() => import("./pages/Goals")),
  statistics: lazy(() => import("./pages/Statistics")),
  settings: lazy(() => import("./pages/Settings")),
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
    void measureStartupPhase("database", "本机数据库", async () => {
      const result = await databaseService.init();
      if (!result.ok) throw new Error(result.error ?? "数据库初始化失败");
      return result;
    })
      .then(() => setDbStatus("ready", null))
      .catch((error: unknown) => {
        setDbStatus("error", error instanceof Error ? error.message : String(error));
      });
  }, [setDbStatus]);

  // 数据库就绪后加载设置与 Extension（加载失败不阻塞启动；错误在「设置 → 扩展」展示）
  useEffect(() => {
    if (dbStatus === "ready") {
      void measureStartupPhase("settings", "用户设置", () =>
        useSettingsStore.getState().load(),
      ).catch(() => {});
      void measureStartupPhase("extensions", "扩展系统", () =>
        useExtensionStore.getState().init(createCoreContext()),
      ).catch(() => {});
      // 加载长期目标（供「长期」页与任务表单的「关联目标」下拉使用）
      void measureStartupPhase("goals", "长期目标", () =>
        useGoalStore.getState().load(),
      ).catch(() => {});
      // 恢复进行中的专注（若存在未结束的 focus_session）
      void measureStartupPhase("focus-restore", "专注恢复", () =>
        useFocusStore.getState().sync(),
      ).catch(() => {});
    }
  }, [dbStatus]);

  return (
    <MotionConfig reducedMotion="user">
      <Layout>
        {dbStatus === "ready" && <FocusBridge />}
        <Suspense fallback={<PageLoading />}>
          {ActivePage ? (
            isExtensionPage ? (
              <ExtensionErrorBoundary key={currentPage} label={currentPage}>
                <PageTransition>
                  <ActivePage />
                </PageTransition>
              </ExtensionErrorBoundary>
            ) : (
              <PageTransition key={currentPage}>
                <ActivePage />
              </PageTransition>
            )
          ) : (
            <section className="p-8 text-sm text-text-secondary"><h1 className="mb-2 text-lg font-semibold">此页面暂不可用</h1><p>扩展可能已移除或尚未启用。你的任务和投入记录仍保存在本机。</p><button className="mt-4 rounded px-4 py-2 focus-visible:outline-2" onClick={() => useAppStore.getState().setPage("today")}>回到今日</button></section>
          )}
        </Suspense>
        <CloseBehaviorDialog />
      </Layout>
    </MotionConfig>
  );
}

function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-text-faint" role="status">
      正在打开页面…
    </div>
  );
}

/** 页面切换过渡：轻量淡入 + 上移（respect 减少动态偏好）。 */
function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motionTiming.micro, ease: "easeOut" }}
      className="flex h-full min-h-0 flex-col"
    >
      {children}
    </motion.div>
  );
}

export default App;
