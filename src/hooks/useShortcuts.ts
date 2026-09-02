import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  SHORTCUT_ACTIONS,
  eventToCombo,
  isEditableTarget,
} from "../lib/shortcuts";
import { dispatchShortcut } from "../lib/shortcutActions";

/** 全局应用内快捷键：输入控件内不触发、忽略按键重复。 */
export function useShortcuts() {
  const shortcuts = useSettingsStore((s) => s.shortcuts);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      const combo = eventToCombo(e);
      // Ctrl+Y 作为重做别名（兼容 Ctrl+Shift+Z；不占用可配置项）
      if (combo === "Ctrl+Y") {
        e.preventDefault();
        dispatchShortcut("redo");
        return;
      }
      for (const action of SHORTCUT_ACTIONS) {
        if (shortcuts[action] === combo) {
          e.preventDefault();
          dispatchShortcut(action);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);
}
