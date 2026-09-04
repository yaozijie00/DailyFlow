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
    <div className="space-y-4 rounded-md border border-neutral-200 bg-white p-5">
      <div>
        <div className="text-sm text-neutral-700">关闭窗口行为</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          点击窗口右上角 X 时的行为；最小化仍进入任务栏，不受此设置影响。
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
          <input
            type="radio"
            name="close-behavior"
            checked={settings.closeBehavior === "exit"}
            onChange={() => setBehavior("exit")}
            className="accent-neutral-900"
          />
          退出 DailyFlow
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
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
        <p className="text-xs text-amber-600">
          尚未设置过关闭行为：第一次点击 X 时会询问你一次。
        </p>
      )}

      <div className="border-t border-neutral-100 pt-4">
        <div className="text-sm text-neutral-700">撤销记录数量</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          保留多少条可撤销操作（内存历史，应用关闭后清空；上限越高占内存越多）。
        </p>
        <select
          value={settings.undoHistoryLimit}
          onChange={(e) => void update({ undoHistoryLimit: Number(e.target.value) })}
          className="mt-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} 条
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-neutral-100 pt-4">
        <div className="text-sm text-neutral-700">启动时默认打开</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          应用启动后首先显示的页面（可随时用导航切换）。
        </p>
        <select
          value={settings.defaultPage}
          onChange={(e) =>
            void update({ defaultPage: e.target.value as typeof settings.defaultPage })
          }
          className="mt-2 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="today">今日</option>
          <option value="focus">专注</option>
          <option value="goals">长期</option>
          <option value="statistics">统计</option>
          <option value="settings">设置</option>
        </select>
      </div>

      <div className="border-t border-neutral-100 pt-4">
        <div className="text-sm text-neutral-700">周起始日</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          影响长期月历与课程表的排列（每周从周几开始）。
        </p>
        <div className="mt-2 flex gap-2">
          {(
            [
              { value: "monday", label: "周一" },
              { value: "sunday", label: "周日" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => void update({ weekStart: o.value })}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                settings.weekStart === o.value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-neutral-100 pt-4">
        <div className="text-sm text-neutral-700">今日页显示</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          控制今日任务列表与便签栏的默认展示。
        </p>
        <div className="mt-2 space-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={settings.todayHideCompleted}
              onChange={(e) => void update({ todayHideCompleted: e.target.checked })}
              className="accent-neutral-900"
            />
            默认隐藏已完成任务
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-neutral-700">
            <input
              type="checkbox"
              checked={settings.todayShowNotes}
              onChange={(e) => void update({ todayShowNotes: e.target.checked })}
              className="accent-neutral-900"
            />
            显示便签栏
          </label>
        </div>
      </div>
    </div>
  );
}
