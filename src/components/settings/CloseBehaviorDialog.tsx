import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { hideToMini, hideToTray, exitApp } from "../../services/windowBehaviorService";
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
    } else if (behavior === "mini") {
      hideToMini();
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="glass-surface mx-auto mt-[12vh] w-full max-w-md rounded-lg border border-border-subtle p-6 shadow-popover">
        <h2 className="text-lg font-semibold text-text-primary">
          {isFirst ? "关闭 DailyFlow" : "退出 DailyFlow"}
        </h2>

        {isFirst ? (
          <>
            <p className="mt-2 text-sm text-text-muted">你希望关闭窗口后：</p>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
                <input
                  type="radio"
                  name="close-behavior"
                  checked={behavior === "exit"}
                  onChange={() => setBehavior("exit")}
                  className="accent-accent"
                />
                退出 DailyFlow
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
                <input
                  type="radio"
                  name="close-behavior"
                  checked={behavior === "tray"}
                  onChange={() => setBehavior("tray")}
                  className="accent-accent"
                />
                隐藏到系统托盘，继续运行
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-text-secondary">
                <input
                  type="radio"
                  name="close-behavior"
                  checked={behavior === "mini"}
                  onChange={() => setBehavior("mini")}
                  className="accent-accent"
                />
                关闭时转迷你窗（Mini）
              </label>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-accent"
              />
              记住我的选择（之后不再询问）
            </label>
          </>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            当前正在进行专注，退出后本次专注将被结束。
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={closeCloseDialog}
            className="rounded-md px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover"
          >
            取消
          </button>
          <button
            onClick={isFirst ? () => void confirmFirst() : confirmExit}
            className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent transition-colors hover:bg-accent-hover"
          >
            {isFirst ? "确定" : "继续退出"}
          </button>
        </div>
      </div>
    </div>
  );
}
