import { useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useLayoutModeStore } from "../lib/layoutMode";
import type { LayoutMode } from "../services/settingsService";

const MODES: { key: LayoutMode; label: string; short: string; desc: string }[] = [
  { key: "standard", label: "Standard", short: "标准", desc: "完整布局，默认视图" },
  { key: "compact", label: "Compact", short: "紧凑", desc: "高信息密度，更多内容同屏" },
  { key: "focus", label: "Focus", short: "专注", desc: "减少干扰，强调当前任务" },
];

const ORDER: LayoutMode[] = ["standard", "compact", "focus"];

/**
 * 侧栏底部视图模式切换（A3）：
 * - 展开态：常驻三段按钮，点击即切换「会话级」模式；
 * - 折叠态（collapsed）：单图标按钮，点击循环切换并 toast 提示当前模式。
 * 启动默认请在 设置 → 外观 中设置。
 */
export function LayoutModeSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const [tip, setTip] = useState<LayoutMode | null>(null);
  const current = useLayoutModeStore((s) => s.current);
  const setCurrent = useLayoutModeStore((s) => s.setCurrent);
  const pushToast = useAppStore((s) => s.pushToast);

  const pick = (m: LayoutMode) => {
    setCurrent(m); // 只影响本次会话
    pushToast("info", `已切换为${MODES.find((x) => x.key === m)?.short}视图（可在设置→外观设为启动默认）`);
  };

  const cycle = () => {
    const idx = ORDER.indexOf(current);
    pick(ORDER[(idx + 1) % ORDER.length]);
  };

  if (collapsed) {
    const cur = MODES.find((m) => m.key === current);
    return (
      <button
        onClick={cycle}
        onMouseEnter={() => setTip(current)}
        onMouseLeave={() => setTip(null)}
        aria-label={`切换视图（当前 ${cur?.label ?? current}）`}
        title={cur ? `${cur.label}：${cur.desc}（点击切换）` : "切换视图模式"}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <LayoutGrid size={15} />
      </button>
    );
  }

  return (
    <div className="flex w-full items-stretch gap-0.5 rounded-md border border-border-subtle bg-surface-muted p-0.5">
      {MODES.map((m) => {
        const active = current === m.key;
        return (
          <button
            key={m.key}
            onClick={() => pick(m.key)}
            onMouseEnter={() => setTip(m.key)}
            onMouseLeave={() => setTip(null)}
            title={m.desc}
            aria-label={`切换视图：${m.label}`}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-1 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "bg-accent text-on-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            {active && <Check size={10} />}
            {m.short}
          </button>
        );
      })}
      {tip != null && (
        <div className="pointer-events-none absolute bottom-full right-0 mb-1 hidden w-44 rounded-md border border-border-subtle bg-bg-elevated p-2 text-[11px] text-text-muted shadow-popover sm:block">
          {MODES.find((x) => x.key === tip)?.desc}
        </div>
      )}
    </div>
  );
}
