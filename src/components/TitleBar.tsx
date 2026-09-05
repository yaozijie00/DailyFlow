import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, Copy, X } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { hideToTray, exitApp } from "../services/windowBehaviorService";

/** 自绘标题栏：左侧品牌 + 可拖拽空白，右侧 Mini/最小化/最大化/关闭。
 *  关闭行为沿用设置：exit→退出；tray→隐藏托盘；mini→转 Mini 窗（P4 引入后生效）。 */
export default function TitleBar() {
  const closeBehavior = useSettingsStore((s) => s.settings.closeBehavior);

  const runClose = () => {
    if (closeBehavior === "tray") hideToTray();
    else if (closeBehavior === "mini") void invoke("toggle_mini_window");
    else exitApp();
  };

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-border-subtle bg-surface select-none">
      {/* 拖拽区：品牌 + 弹性空白（不含按钮，避免点击按钮触发窗口拖动） */}
      <div
        data-tauri-drag-region
        onDoubleClick={() => void invoke("window_maximize_toggle")}
        className="flex min-w-0 flex-1 items-center gap-2 pl-4"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        <span className="text-sm font-semibold text-text-primary">DailyFlow</span>
      </div>
      <div className="flex items-center">
        <TitleButton label="打开迷你窗" onClick={() => void invoke("toggle_mini_window")}>
          <Copy size={14} />
        </TitleButton>
        <TitleButton label="最小化" onClick={() => void invoke("window_minimize")}>
          <Minus size={14} />
        </TitleButton>
        <TitleButton label="最大化/还原" onClick={() => void invoke("window_maximize_toggle")}>
          <Square size={12} />
        </TitleButton>
        <TitleButton label="关闭" onClick={runClose}>
          <X size={14} />
        </TitleButton>
      </div>
    </div>
  );
}

function TitleButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      {children}
    </button>
  );
}
