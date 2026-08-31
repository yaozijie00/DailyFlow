import { sendNotification } from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

/**
 * 专注通知：优先 Tauri 系统通知（Windows toast，全局可见）。
 * sendNotification 为 fire-and-forget（无返回值）；在非 Tauri 环境
 * 调用会同步抛错，此时回退到应用内全局 Toast（挂在 Layout，跨页面可见）。
 * 受 Settings「专注通知」开关控制（默认开启）。
 */
export function notifyFocus(title: string, body: string): void {
  if (!useSettingsStore.getState().settings.notificationsEnabled) return;
  try {
    sendNotification({ title, body });
  } catch {
    useAppStore.getState().pushToast("info", `${title}：${body}`);
  }
}
