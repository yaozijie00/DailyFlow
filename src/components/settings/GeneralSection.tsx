import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const SNAP_OPTIONS = [5, 10, 15, 30, 60];

export default function GeneralSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState({
    startHour: Math.floor(settings.timelineStartMinutes / 60),
    endHour: Math.floor(settings.timelineEndMinutes / 60),
    snapMinutes: settings.timelineSnapMinutes,
    pxPerMinute: settings.timelinePxPerMinute,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await update({
      timelineStartMinutes: draft.startHour * 60,
      timelineEndMinutes: draft.endHour * 60,
      timelineSnapMinutes: draft.snapMinutes,
      timelinePxPerMinute: draft.pxPerMinute,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 bg-white p-5">
      {(
        [
          ["时间轴开始时间", "start", draft.startHour, (v: number) => setDraft((d) => ({ ...d, startHour: v })), HOURS.filter((h) => h <= 23)],
          ["时间轴结束时间", "end", draft.endHour, (v: number) => setDraft((d) => ({ ...d, endHour: v })), HOURS.filter((h) => h >= 1)],
        ] as const
      ).map(([label, id, value, onChange, options]) => (
        <div key={id} className="flex items-center justify-between gap-4">
          <label htmlFor={id} className="text-sm text-neutral-700">{label}</label>
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {options.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="snap" className="text-sm text-neutral-700">时间轴吸附粒度</label>
        <select
          id="snap"
          value={draft.snapMinutes}
          onChange={(e) => setDraft((d) => ({ ...d, snapMinutes: Number(e.target.value) }))}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        >
          {SNAP_OPTIONS.map((s) => (
            <option key={s} value={s}>{s} 分钟</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="px" className="text-sm text-neutral-700">时间轴缩放（每像素分钟数）</label>
        <input
          id="px"
          type="number"
          min={1}
          max={3}
          step={0.25}
          value={draft.pxPerMinute}
          onChange={(e) => setDraft((d) => ({ ...d, pxPerMinute: Number(e.target.value) }))}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
        />
      </div>
      <p className="text-xs text-neutral-400">
        数值越大时间轴越稀疏（1 = 1 分钟 1px，1.5 = 默认，3 = 最密）；时间轴上按住 Ctrl + 鼠标滚轮也可缩放。
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
