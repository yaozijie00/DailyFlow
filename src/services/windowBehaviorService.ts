import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, type Page } from "../stores/appStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePomodoroStore } from "../stores/pomodoroStore";
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
export type CloseAction = "dialog" | "hide" | "exit" | "exit-confirm";

export function resolveCloseAction(
  configured: boolean,
  behavior: CloseBehavior,
  focusRunning: boolean,
): CloseAction {
  if (!configured) return "dialog"; // 首次点击 X：询问并记住
  if (behavior === "tray") return "hide"; // 隐藏到系统托盘，Focus 继续运行
  return focusRunning ? "exit-confirm" : "exit"; // 退出（Focus 运行中先确认）
}

function focusRunning(): boolean {
  const s = usePomodoroStore.getState().snapshot.state;
  return s === "RUNNING" || s === "PAUSED";
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
    case "exit-confirm":
      useAppStore.getState().openCloseDialog("exit-focus");
      break;
    case "exit":
      void invoke("exit_app");
      break;
  }
}

function handleTrayToggleFocus(): void {
  const p = usePomodoroStore.getState();
  const s = p.snapshot.state;
  if (s === "RUNNING") p.pause();
  else if (s === "PAUSED") p.resume();
  else useAppStore.getState().pushToast("info", "请先在「专注」页选择任务开始番茄钟");
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
 * - app-close-requested：Rust 窗口 X 被点击；
 * - tray-toggle-focus：托盘「开始 / 暂停专注」；
 * - tray-open-page：托盘「打开今日/长期/统计」。
 */
export function initWindowBehavior(): () => void {
  let disposed = false;
  const unlisteners: Array<() => void> = [];
  void listen("app-close-requested", () => handleCloseRequest()).then((fn) => {
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

/** 真正退出应用（供关闭行为对话框调用）。 */
export function exitApp(): void {
  void invoke("exit_app");
}
