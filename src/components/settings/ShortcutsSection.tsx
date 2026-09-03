import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTION_LABELS,
  SHORTCUT_ACTIONS,
  eventToCombo,
  findDuplicateCombo,
  isDefaultShortcuts,
  type ShortcutAction,
} from "../../lib/shortcuts";

export default function ShortcutsSection() {
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const saveShortcuts = useSettingsStore((s) => s.saveShortcuts);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const handleRecord = (action: ShortcutAction) => {
    setMsg(null);
    setRecording(action);
  };

  const handleKey = (e: React.KeyboardEvent, action: ShortcutAction) => {
    e.preventDefault();
    e.stopPropagation();
    if (recording !== action) return;
    const combo = eventToCombo(e);
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      setMsg({ type: "error", text: "请至少包含一个修饰键（Ctrl/Alt/Shift/Win）" });
      return;
    }
    const next = { ...shortcuts, [action]: combo };
    const dup = findDuplicateCombo(combo, next, action);
    if (dup) {
      setMsg({ type: "error", text: `该快捷键已被「${SHORTCUT_ACTION_LABELS[dup]}」使用` });
      return;
    }
    void saveShortcuts(next);
    setRecording(null);
    setMsg({ type: "ok", text: `已保存：${SHORTCUT_ACTION_LABELS[action]} = ${combo}` });
  };

  const handleClear = (action: ShortcutAction) => {
    void saveShortcuts({ ...shortcuts, [action]: "" });
    setMsg({ type: "ok", text: `已禁用：${SHORTCUT_ACTION_LABELS[action]}` });
  };

  const handleReset = () => {
    void saveShortcuts({ ...DEFAULT_SHORTCUTS });
    setMsg({ type: "ok", text: "已恢复默认快捷键" });
  };

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-5">
      {SHORTCUT_ACTIONS.map((action) => (
        <div key={action} className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-ink">{SHORTCUT_ACTION_LABELS[action]}</div>
            <div className="font-mono text-xs text-ink-2">
              {shortcuts[action] || "（未设置）"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {recording === action ? (
              <button
                onKeyDown={(e) => handleKey(e, action)}
                className="rounded-md border border-blue-400 bg-blue-50 px-3 py-1.5 text-sm text-blue-700"
              >
                按下组合键…
              </button>
            ) : (
              <button
                onClick={() => handleRecord(action)}
                className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink hover:bg-canvas"
              >
                修改
              </button>
            )}
            {shortcuts[action] !== "" && (
              <button
                onClick={() => handleClear(action)}
                className="rounded-md border border-line-strong px-2 py-1.5 text-xs text-ink-2 hover:bg-canvas"
              >
                清除
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 border-t border-line-soft pt-3">
        <button
          onClick={handleReset}
          disabled={isDefaultShortcuts(shortcuts)}
          className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:bg-line"
        >
          恢复默认值
        </button>
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-success" : "text-error"}`}>
            {msg.text}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-3">
        快捷键在应用窗口聚焦时生效；在输入框中不会触发。
      </p>
    </div>
  );
}
