import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { Density } from "../../services/settingsService";

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const SNAP_OPTIONS = [5, 10, 15, 30, 60];
const DENSITIES: { key: Density; label: string }[] = [
  { key: "compact", label: "紧凑" },
  { key: "comfortable", label: "舒适" },
  { key: "spacious", label: "宽松" },
];

/** 外观：密度 + 时间轴显示设置（开始/结束时间、吸附粒度、缩放）。 */
export default function AppearanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [draft, setDraft] = useState({
    startHour: Math.floor(settings.timelineStartMinutes / 60),
    endHour: Math.floor(settings.timelineEndMinutes / 60),
    snapMinutes: settings.timelineSnapMinutes,
    pxPerMinute: settings.timelinePxPerMinute,
    density: settings.density as Density,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await update({
      timelineStartMinutes: draft.startHour * 60,
      timelineEndMinutes: draft.endHour * 60,
      timelineSnapMinutes: draft.snapMinutes,
      timelinePxPerMinute: draft.pxPerMinute,
      density: draft.density,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-md border border-line bg-surface p-5">
      <div>
        <div className="mb-2 text-sm text-ink">界面密度</div>
        <div className="flex rounded-md border border-line bg-raised p-0.5 self-start">
          {DENSITIES.map((d) => (
            <button
              key={d.key}
              onClick={() => setDraft((prev) => ({ ...prev, density: d.key }))}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                draft.density === d.key
                  ? "bg-brand text-white"
                  : "text-ink-2 hover:bg-raised-2"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {(
        [
          ["时间轴开始时间", "start", draft.startHour, (v: number) => setDraft((d) => ({ ...d, startHour: v })), HOURS.filter((h) => h <= 23)],
          ["时间轴结束时间", "end", draft.endHour, (v: number) => setDraft((d) => ({ ...d, endHour: v })), HOURS.filter((h) => h >= 1)],
        ] as const
      ).map(([label, id, value, onChange, options]) => (
        <div key={id} className="flex items-center justify-between gap-4">
          <label htmlFor={id} className="text-sm text-ink">{label}</label>
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="rounded-md border border-line-strong px-2 py-1.5 text-sm"
          >
            {options.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="snap" className="text-sm text-ink">时间轴吸附粒度</label>
        <select
          id="snap"
          value={draft.snapMinutes}
          onChange={(e) => setDraft((d) => ({ ...d, snapMinutes: Number(e.target.value) }))}
          className="rounded-md border border-line-strong px-2 py-1.5 text-sm"
        >
          {SNAP_OPTIONS.map((s) => (
            <option key={s} value={s}>{s} 分钟</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="px" className="text-sm text-ink">时间轴缩放（每像素分钟数）</label>
        <input
          id="px"
          type="number"
          min={1}
          max={3}
          step={0.25}
          value={draft.pxPerMinute}
          onChange={(e) => setDraft((d) => ({ ...d, pxPerMinute: Number(e.target.value) }))}
          className="w-20 rounded-md border border-line-strong px-2 py-1.5 text-sm"
        />
      </div>
      <p className="text-xs text-ink-3">
        数值越大时间轴越稀疏（1 = 1 分钟 1px，1.5 = 默认，3 = 最密）；时间轴上按住 Ctrl + 鼠标滚轮也可缩放。
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          保存
        </button>
        {saved && <span className="text-sm text-success">已保存</span>}
      </div>
    </div>
  );
}
