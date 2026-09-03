import { useSettingsStore } from "../../stores/settingsStore";

/**
 * 通用：关闭窗口行为（点击窗口右上角 X 后）：
 * - 退出 DailyFlow：直接退出应用；
 * - 隐藏到系统托盘：窗口隐藏、应用与 Focus 继续运行（托盘可恢复/退出）。
 * 选择立即保存并生效；同时标记为「已配置」（此后点击 X 不再询问）。
 */
export default function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const setBehavior = (value: "exit" | "tray") => {
    void update({ closeBehavior: value, closeBehaviorConfigured: true });
  };

  return (
    <div className="space-y-4 rounded-md border border-line bg-surface p-5">
      <div>
        <div className="text-sm text-ink">关闭窗口行为</div>
        <p className="mt-0.5 text-xs text-ink-3">
          点击窗口右上角 X 时的行为；最小化仍进入任务栏，不受此设置影响。
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-ink">
          <input
            type="radio"
            name="close-behavior"
            checked={settings.closeBehavior === "exit"}
            onChange={() => setBehavior("exit")}
            className="accent-neutral-900"
          />
          退出 DailyFlow
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-ink">
          <input
            type="radio"
            name="close-behavior"
            checked={settings.closeBehavior === "tray"}
            onChange={() => setBehavior("tray")}
            className="accent-neutral-900"
          />
          隐藏到系统托盘
        </label>
      </div>
      {!settings.closeBehaviorConfigured && (
        <p className="text-xs text-warn">
          尚未设置过关闭行为：第一次点击 X 时会询问你一次。
        </p>
      )}

      <div className="border-t border-line-soft pt-4">
        <div className="text-sm text-ink">撤销记录数量</div>
        <p className="mt-0.5 text-xs text-ink-3">
          保留多少条可撤销操作（内存历史，应用关闭后清空；上限越高占内存越多）。
        </p>
        <select
          value={settings.undoHistoryLimit}
          onChange={(e) => void update({ undoHistoryLimit: Number(e.target.value) })}
          className="mt-2 rounded-md border border-line-strong px-2 py-1.5 text-sm"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} 条
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
