import { sendNotification } from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

function notificationsEnabled(): boolean {
  return useSettingsStore.getState().settings.notificationsEnabled;
}

/** 专注开始提醒：应用内全局 Toast（轻量，不打扰系统）。 */
export function notifyFocusStart(taskName: string): void {
  if (!notificationsEnabled()) return;
  useAppStore.getState().pushToast("info", `开始专注：${taskName}`);
}

/**
 * 专注结束提醒：系统通知（电脑提醒），标题固定「DailyFlow」，
 * 正文「专注完成/结束：任务名」；系统通知不可用（非 Tauri 环境）时回退应用内 Toast。
 * 受 Settings「专注通知」开关控制（默认开启）。
 */
export function notifyFocusEnd(taskName: string, completed: boolean): void {
  if (!notificationsEnabled()) return;
  const body = `${completed ? "专注完成" : "专注结束"}：${taskName}`;
  try {
    sendNotification({ title: "DailyFlow", body });
  } catch {
    useAppStore.getState().pushToast("info", body);
  }
}
