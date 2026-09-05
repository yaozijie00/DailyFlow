import { useSettingsStore } from "../../stores/settingsStore";

/** 通知：Focus 完成系统通知开关。 */
export default function NotificationSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  return (
    <div className="space-y-4 rounded-md border border-border-subtle glass-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-text-secondary">Focus 完成通知</div>
          <p className="mt-0.5 text-xs text-text-faint">
            专注完成/结束时发送 Windows 桌面通知（应用最小化或隐藏到托盘也有效）。
          </p>
        </div>
        <input
          type="checkbox"
          checked={settings.notificationsEnabled}
          onChange={(e) => void update({ notificationsEnabled: e.target.checked })}
          className="h-4 w-4 accent-accent"
          aria-label="Focus 完成通知"
        />
      </div>
    </div>
  );
}
