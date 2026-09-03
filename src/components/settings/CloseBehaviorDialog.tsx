import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { hideToTray, exitApp } from "../../services/windowBehaviorService";
import type { CloseBehavior } from "../../services/settingsService";

/**
 * 关闭行为对话框（V1.4.1 窗口行为）：
 * - first：首次点击窗口 X 时询问「退出 / 隐藏到系统托盘」，可勾选「记住我的选择」；
 *   取消 → 不保存、不执行，下次仍询问；
 * - exit-focus：已配置为退出且 Focus 运行中 → 额外确认「退出后本次专注将被结束」。
 * 视觉与全局 Modal 一致（Modern / Minimal / Calm）。
 */
export default function CloseBehaviorDialog() {
  const closeDialog = useAppStore((s) => s.closeDialog);
  const closeCloseDialog = useAppStore((s) => s.closeCloseDialog);
  const updateSettings = useSettingsStore((s) => s.update);
  const [behavior, setBehavior] = useState<CloseBehavior>("exit");
  const [remember, setRemember] = useState(false);

  if (closeDialog == null) return null;

  const isFirst = closeDialog === "first";
  const focusRunning =
    usePomodoroStore.getState().snapshot.state === "RUNNING" ||
    usePomodoroStore.getState().snapshot.state === "PAUSED";

  /** 首次对话框：确定后按选择执行；勾选「记住我的选择」则持久化。 */
  const confirmFirst = async () => {
    if (remember) {
      await updateSettings({ closeBehavior: behavior, closeBehaviorConfigured: true });
    }
    closeCloseDialog();
    if (behavior === "tray") {
      hideToTray(); // 隐藏到托盘，Focus 继续运行
    } else if (focusRunning) {
      useAppStore.getState().openCloseDialog("exit-focus"); // 退出且 Focus 运行中 → 再确认
    } else {
      exitApp();
    }
  };

  const confirmExit = () => {
    closeCloseDialog();
    exitApp();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[26rem] rounded-lg bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">
          {isFirst ? "关闭 DailyFlow" : "退出 DailyFlow"}
        </h2>

        {isFirst ? (
          <>
            <p className="mt-2 text-sm text-ink-2">你希望关闭窗口后：</p>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-ink">
                <input
                  type="radio"
                  name="close-behavior"
                  checked={behavior === "exit"}
                  onChange={() => setBehavior("exit")}
                  className="accent-neutral-900"
                />
                退出 DailyFlow
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-ink">
                <input
                  type="radio"
                  name="close-behavior"
                  checked={behavior === "tray"}
                  onChange={() => setBehavior("tray")}
                  className="accent-neutral-900"
                />
                隐藏到系统托盘，继续运行
              </label>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-neutral-900"
              />
              记住我的选择（之后不再询问）
            </label>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-2">
            当前正在进行专注，退出后本次专注将被结束。
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={closeCloseDialog}
            className="rounded-md px-4 py-2 text-sm text-ink-2 hover:bg-canvas"
          >
            取消
          </button>
          <button
            onClick={isFirst ? () => void confirmFirst() : confirmExit}
            className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            {isFirst ? "确定" : "继续退出"}
          </button>
        </div>
      </div>
    </div>
  );
}
