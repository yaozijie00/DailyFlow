import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "../stores/settingsStore";
import { useAppStore } from "../stores/appStore";

function notificationsEnabled(): boolean {
  return useSettingsStore.getState().settings.notificationsEnabled;
}

/** 当前已调度的「专注完成」Rust 原生通知 id（无则 null）。 */
let scheduledTimerId: number | null = null;

/**
 * 专注开始提醒：应用内全局 Toast（轻量，不打扰系统）。
 */
export function notifyFocusStart(taskName: string): void {
  if (!notificationsEnabled()) return;
  useAppStore.getState().pushToast("info", `开始专注：${taskName}`);
}

/**
 * 专注结束提醒：系统通知（电脑提醒），标题固定「DailyFlow」，
 * 正文「专注完成/结束：任务名」；系统通知不可用（非 Tauri 环境）时回退应用内 Toast。
 * 受 Settings「专注通知」开关控制（默认开启）。
 */
export function notifyFocusEnd(
  taskName: string,
  completed: boolean,
  actualMinutes?: number,
): void {
  if (!notificationsEnabled()) return;
  const time =
    completed || actualMinutes == null
      ? ""
      : `，本次实际投入 ${actualMinutes} 分钟`;
  const body = `${completed ? "专注完成" : "专注结束"}：${taskName}${time}`;
  try {
    sendNotification({ title: "DailyFlow", body });
  } catch {
    useAppStore.getState().pushToast("info", body);
  }
}

/**
 * 调度「专注完成」系统通知（Rust 原生线程，最小化/后台也准时触发）。
 * 由专注开始/恢复/重启恢复时调用；受通知开关控制。
 */
export function scheduleFocusEndNotification(
  endAtMs: number,
  plannedMinutes: number,
): void {
  if (!notificationsEnabled()) return;
  void invoke<number>("schedule_focus_end_notification", { endAtMs, plannedMinutes })
    .then((id) => {
      scheduledTimerId = id;
    })
    .catch(() => {
      /* 调度失败静默：应用内轮询看门狗仍会兜底落库 */
    });
}

/** 取消已调度的「专注完成」通知（暂停/提前结束/放弃时调用；幂等）。 */
export function cancelScheduledFocusEndNotification(): void {
  if (scheduledTimerId == null) return;
  const id = scheduledTimerId;
  scheduledTimerId = null;
  void invoke("cancel_focus_notification", { timerId: id }).catch(() => {});
}
