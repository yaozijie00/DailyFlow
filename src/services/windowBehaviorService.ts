import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, type Page } from "../stores/appStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useFocusStore } from "../features/focus/focusStore";
import { useTaskStore } from "../stores/taskStore";
import type { CloseBehavior } from "./settingsService";

/**
 * 窗口生命周期服务（V1.4.1）：
 * UI → SettingsStore → WindowBehaviorService → Tauri
 *
 * - 拦截 Rust 的「关闭请求」（app-close-requested）事件；
 * - 按 closeBehavior 决策：未配置→首次询问；tray→隐藏；exit→（Focus 运行中先确认）退出；
 * - 托盘「开始/暂停专注」事件转发给 PomodoroStore；
 * - 隐藏到托盘后应用继续运行，Focus 计时/通知不受窗口状态影响。
 */

/** 纯决策函数（可单测）：给定设置与 Focus 状态，返回应执行的动作。 */
export type CloseAction = "dialog" | "hide" | "exit" | "exit-confirm" | "mini";

export function resolveCloseAction(
  configured: boolean,
  behavior: CloseBehavior,
  focusRunning: boolean,
): CloseAction {
  if (!configured) return "dialog"; // 首次点击 X：询问并记住
  if (behavior === "tray") return "hide"; // 隐藏到系统托盘，Focus 继续运行
  if (behavior === "mini") return "mini"; // 关闭主窗 → 转 Mini 悬浮窗
  return focusRunning ? "exit-confirm" : "exit"; // 退出（Focus 运行中先确认）
}

function focusRunning(): boolean {
  return useFocusStore.getState().active != null;
}

function handleCloseRequest(): void {
  const { closeBehavior, closeBehaviorConfigured } = useSettingsStore.getState().settings;
  const action = resolveCloseAction(closeBehaviorConfigured, closeBehavior, focusRunning());
  switch (action) {
    case "dialog":
      useAppStore.getState().openCloseDialog("first");
      break;
    case "hide":
      void invoke("hide_to_tray");
      break;
    case "mini":
      void invoke("toggle_mini_window");
      break;
    case "exit-confirm":
      useAppStore.getState().openCloseDialog("exit-focus");
      break;
    case "exit":
      void invoke("exit_app");
      break;
  }
}

function handleTrayToggleFocus(): void {
  const p = useFocusStore.getState();
  const s = p.active?.status;
  if (s === "running") void p.perform({ action: "pause" });
  else if (s === "paused") void p.perform({ action: "resume" });
  else useAppStore.getState().pushToast("info", "请先在「专注」页选择任务开始推进");
}

const TRAY_PAGES: Page[] = ["today", "focus", "goals", "statistics", "settings"];

/** 托盘「打开今日/长期/统计」：切页并显示窗口。 */
function handleTrayOpenPage(page: unknown): void {
  const p = page as string;
  if (TRAY_PAGES.includes(p as Page)) {
    useAppStore.getState().setPage(p as Page);
  }
}

/**
 * 初始化窗口行为监听（App 挂载时调用一次）。返回清理函数。
 * - app-close-requested：Rust 窗口 X 被点击（主窗）；
 * - df:tasks-changed：Mini 窗任务变更广播（主窗刷新任务）；
 * - tray-toggle-focus：托盘「开始 / 暂停专注」；
 * - tray-open-page：托盘「打开今日/长期/统计」。
 * 注：Tauri 2.11 WindowEvent 无 Minimized 变体 → 「最小化自动转 Mini」不可达，
 * Mini 窗经托盘菜单「打开 Mini 窗」入口（A4 降级说明见 open_mini_window）。
 */
export function initWindowBehavior(): () => void {
  let disposed = false;
  const unlisteners: Array<() => void> = [];
  void listen("app-close-requested", () => handleCloseRequest()).then((fn) => {
    if (disposed) fn();
    else unlisteners.push(fn);
  });
  void listen("df:tasks-changed", () => {
    // Mini 窗完成任务后主窗刷新（跨窗同步；失败静默不影响主流程）
    try {
      void useTaskStore.getState().load();
    } catch {
      /* ignore */
    }
  }).then((fn) => {
    if (disposed) fn();
    else unlisteners.push(fn);
  });
  void listen("tray-toggle-focus", () => handleTrayToggleFocus()).then((fn) => {
    if (disposed) fn();
    else unlisteners.push(fn);
  });
  void listen("tray-open-page", (e) => handleTrayOpenPage(e.payload)).then((fn) => {
    if (disposed) fn();
    else unlisteners.push(fn);
  });
  return () => {
    disposed = true;
    for (const fn of unlisteners) fn();
  };
}

/** 隐藏到系统托盘（供关闭行为对话框/设置直接调用）。 */
export function hideToTray(): void {
  void invoke("hide_to_tray");
}

/** 关闭主窗 → 转 Mini 悬浮窗（供关闭行为对话框「转迷你窗」调用）。 */
export function hideToMini(): void {
  void invoke("toggle_mini_window");
}

/** 真正退出应用（供关闭行为对话框调用）。 */
export function exitApp(): void {
  void (async () => { const state = useFocusStore.getState(); if (state.active?.status === "running" && !await state.perform({ action: "pause" })) return; await invoke("exit_app"); })();
}
