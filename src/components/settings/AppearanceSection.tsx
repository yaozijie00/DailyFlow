import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useLayoutModeStore } from "../../lib/layoutMode";
import type { LayoutMode } from "../../services/settingsService";
import { THEME_MODES, type ThemeMode } from "../../lib/theme";

const HOURS = Array.from({ length: 25 }, (_, i) => i);
const SNAP_OPTIONS = [5, 10, 15, 30, 60];

const LAYOUT_OPTIONS: { key: LayoutMode; label: string; desc: string }[] = [
  { key: "standard", label: "Standard（完整）", desc: "完整布局与信息密度" },
  { key: "compact", label: "Compact（紧凑）", desc: "高信息密度，适合大量任务/高分辨率" },
  { key: "focus", label: "Focus（专注）", desc: "减少干扰，强调当前任务" },
];

const THEME_META: Record<ThemeMode, { label: string; desc: string }> = {
  system: { label: "跟随系统", desc: "自动随 Windows 深浅色切换（浅色/深色）" },
  light: { label: "浅色", desc: "明亮、暖白底 + 靛蓝强调" },
  dark: { label: "深色", desc: "深炭底，护眼低亮" },
  glass: { label: "毛玻璃", desc: "柔和渐变底 + 半透明磨砂卡片（Apple 风）" },
};

/** 外观：界面主题 + 默认视图模式 + 时间轴显示设置。 */
export default function AppearanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const setCurrent = useLayoutModeStore((s) => s.setCurrent);
  const [layoutMsg, setLayoutMsg] = useState(false);
  const [draft, setDraft] = useState({
    startHour: Math.floor(settings.timelineStartMinutes / 60),
    endHour: Math.floor(settings.timelineEndMinutes / 60),
    snapMinutes: settings.timelineSnapMinutes,
    pxPerMinute: settings.timelinePxPerMinute,
  });
  const [saved, setSaved] = useState(false);

  // A3：默认视图模式（改动即保存并同步当前会话）
  const handleLayoutChange = async (m: LayoutMode) => {
    if (!await update({ defaultLayoutMode: m })) return;
    setCurrent(m);
    setLayoutMsg(true);
    window.setTimeout(() => setLayoutMsg(false), 2000);
  };

  // V2.4：界面主题（改动即保存；settingsStore.update 内已同步应用到 <html>）
  const handleThemeChange = async (m: ThemeMode) => {
    await update({ themeMode: m });
  };

  const handleSave = async () => {
    setSaved(false);
    const ok = await update({
      timelineStartMinutes: draft.startHour * 60,
      timelineEndMinutes: draft.endHour * 60,
      timelineSnapMinutes: draft.snapMinutes,
      timelinePxPerMinute: draft.pxPerMinute,
    });
    if (!ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const selectCls =
    "rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";

  return (
    <div className="glass-surface space-y-4 rounded-md border border-border-subtle p-5">
      {/* 界面主题 */}
      <div>
        <div className="text-sm text-text-secondary">界面主题</div>
        <p className="mt-0.5 text-xs text-text-faint">
          主题即时生效并自动保存；毛玻璃为窗口内柔和磨砂质感。
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {THEME_MODES.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                settings.themeMode === m
                  ? "border-accent bg-accent-soft"
                  : "border-border-strong hover:bg-surface-hover"
              }`}
            >
              <input
                type="radio"
                name="theme-mode"
                className="accent-accent"
                checked={settings.themeMode === m}
                onChange={() => void handleThemeChange(m)}
              />
              <span className="min-w-0">
                <span className="block text-text-primary">{THEME_META[m].label}</span>
                <span className="block text-xs text-text-faint">{THEME_META[m].desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 启动默认视图模式 */}
      <div className="border-t border-border-subtle pt-4">
        <div className="text-sm text-text-secondary">启动默认视图模式</div>
        <p className="mt-0.5 text-xs text-text-faint">
          启动时使用的布局密度；运行中随时可用左下角「视图模式」切换本次会话（不改变此默认值）。
          点击下方任一选项立即保存为启动默认。
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {LAYOUT_OPTIONS.map((o) => (
            <label
              key={o.key}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                settings.defaultLayoutMode === o.key
                  ? "border-accent bg-accent-soft"
                  : "border-border-strong hover:bg-surface-hover"
              }`}
            >
              <input
                type="radio"
                name="layout-mode"
                className="accent-accent"
                checked={settings.defaultLayoutMode === o.key}
                onChange={() => void handleLayoutChange(o.key)}
              />
              <span className="min-w-0">
                <span className="block text-text-primary">{o.label}</span>
                <span className="block text-xs text-text-faint">{o.desc}</span>
              </span>
            </label>
          ))}
        </div>
        {layoutMsg && <p className="mt-1 text-xs text-success">默认视图已更新（并应用到当前会话）</p>}
      </div>

      {/* 时间轴显示 */}
      <div className="border-t border-border-subtle pt-4">
        {(
          [
            ["时间轴开始时间", "start", draft.startHour, (v: number) => setDraft((d) => ({ ...d, startHour: v })), HOURS.filter((h) => h <= 23)],
            ["时间轴结束时间", "end", draft.endHour, (v: number) => setDraft((d) => ({ ...d, endHour: v })), HOURS.filter((h) => h >= 1)],
          ] as const
        ).map(([label, id, value, onChange, options]) => (
          <div key={id} className="flex items-center justify-between gap-4">
            <label htmlFor={id} className="text-sm text-text-secondary">{label}</label>
            <select
              id={id}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              className={selectCls}
            >
              {options.map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="snap" className="text-sm text-text-secondary">时间轴吸附粒度</label>
          <select
            id="snap"
            value={draft.snapMinutes}
            onChange={(e) => setDraft((d) => ({ ...d, snapMinutes: Number(e.target.value) }))}
            className={selectCls}
          >
            {SNAP_OPTIONS.map((s) => (
              <option key={s} value={s}>{s} 分钟</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="px" className="text-sm text-text-secondary">时间轴缩放（每像素分钟数）</label>
          <input
            id="px"
            type="number"
            min={1}
            max={3}
            step={0.25}
            value={draft.pxPerMinute}
            onChange={(e) => setDraft((d) => ({ ...d, pxPerMinute: Number(e.target.value) }))}
            className={`${selectCls} w-20`}
          />
        </div>
        <p className="text-xs text-text-faint">
          数值越大时间轴越稀疏（1 = 1 分钟 1px，1.5 = 默认，3 = 最密）；时间轴上按住 Ctrl + 鼠标滚轮也可缩放。
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            className="rounded-md bg-accent px-4 py-2 text-sm text-on-accent transition-colors hover:bg-accent-hover"
          >
            保存
          </button>
          {saved && <span className="text-sm text-success">已保存</span>}
        </div>
      </div>
    </div>
  );
}
