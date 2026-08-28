import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

interface Draft {
  focusMinutes: number;
  shortBreak: number;
  longBreak: number;
  interval: number;
}

export default function PomodoroSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState<Draft>({
    focusMinutes: settings.pomodoroDurationMinutes,
    shortBreak: settings.shortBreakMinutes,
    longBreak: settings.longBreakMinutes,
    interval: settings.longBreakInterval,
  });
  const [saved, setSaved] = useState(false);

  const fields: { key: keyof Draft; label: string; min: number; max: number; unit: string }[] = [
    { key: "focusMinutes", label: "专注时长", min: 1, max: 180, unit: "分钟" },
    { key: "shortBreak", label: "短休息", min: 1, max: 30, unit: "分钟" },
    { key: "longBreak", label: "长休息", min: 1, max: 60, unit: "分钟" },
    { key: "interval", label: "长休息间隔", min: 2, max: 10, unit: "个番茄" },
  ];

  const handleSave = async () => {
    await update({
      pomodoroDurationMinutes: draft.focusMinutes,
      shortBreakMinutes: draft.shortBreak,
      longBreakMinutes: draft.longBreak,
      longBreakInterval: draft.interval,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 bg-white p-5">
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-4">
          <label className="text-sm text-neutral-700">{f.label}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-neutral-500">{f.unit}</span>
          </div>
        </div>
      ))}
      <p className="text-xs text-neutral-400">
        休息时长设置已保存；休息循环将在后续版本接入计时流程。
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          保存
        </button>
        {saved && <span className="text-sm text-green-600">已保存</span>}
      </div>
    </div>
  );
}
