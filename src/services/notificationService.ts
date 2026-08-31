import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

/**
 * 专注通知：应用内全局 Toast（挂在 Layout，右上角，跨页面可见），
 * 不打扰系统。受 Settings「专注通知」开关控制（默认开启）。
 */
export function notifyFocus(title: string, body: string): void {
  if (!useSettingsStore.getState().settings.notificationsEnabled) return;
  useAppStore.getState().pushToast("info", `${title}：${body}`);
}
