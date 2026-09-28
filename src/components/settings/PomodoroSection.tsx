import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

interface Draft {
  focusMinutes: number;
  shortBreak: number;
}

export default function PomodoroSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState<Draft>({
    focusMinutes: settings.pomodoroDurationMinutes,
    shortBreak: settings.shortBreakMinutes,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");

  const fields: { key: keyof Draft; label: string; min: number; max: number; unit: string }[] = [
    { key: "focusMinutes", label: "番茄节奏默认目标", min: 1, max: 180, unit: "分钟" },
    { key: "shortBreak", label: "默认休息", min: 1, max: 30, unit: "分钟" },
  ];

  const handleSave = async () => {
    if (busy) return;
    setBusy(true); setError(""); setSaved(false);
    try {
    const ok = await update({
      pomodoroDurationMinutes: draft.focusMinutes,
      shortBreakMinutes: draft.shortBreak,
    });
    if (!ok) { setError("保存失败，输入已保留，请重试。"); return; }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    } catch { setError("保存失败，输入已保留，请重试。"); }
    finally { setBusy(false); }
  };

  return (
    <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
      {fields.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-4">
          <label htmlFor={`focus-setting-${f.key}`} className="text-sm text-text-secondary">{f.label}</label>
          <div className="flex items-center gap-2">
            <input
              id={`focus-setting-${f.key}`}
              required
              type="number"
              min={f.min}
              max={f.max}
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
              className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-text-muted">{f.unit}</span>
          </div>
        </div>
      ))}
      <p className="text-xs text-text-faint">
        默认使用自由计时。目标到达后可继续；休息由你选择，不计入任务投入。
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent hover:bg-accent-hover"
        >
          保存
        </button>
        {saved && <span className="text-sm text-green-600">已保存</span>}
        {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
