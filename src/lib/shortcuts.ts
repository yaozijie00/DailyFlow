export type ShortcutAction =
  | "open_dailyflow"
  | "create_task"
  | "pomodoro_toggle"
  | "complete_task"
  | "open_today"
  | "open_focus"
  | "open_news"
  | "refresh_news"
  | "open_settings";

export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "open_dailyflow",
  "create_task",
  "pomodoro_toggle",
  "complete_task",
  "open_today",
  "open_focus",
  "open_news",
  "refresh_news",
  "open_settings",
];

export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  open_dailyflow: "显示 DailyFlow 窗口",
  create_task: "新建任务（打开弹窗）",
  pomodoro_toggle: "暂停/继续番茄钟",
  complete_task: "完成选中任务",
  open_today: "打开今日",
  open_focus: "打开专注",
  open_news: "打开新闻",
  refresh_news: "刷新新闻",
  open_settings: "打开设置",
};

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  open_dailyflow: "Ctrl+Shift+D",
  create_task: "Ctrl+Shift+T",
  pomodoro_toggle: "Ctrl+Space",
  complete_task: "Ctrl+Shift+Enter",
  open_today: "Ctrl+1",
  open_focus: "Ctrl+2",
  open_news: "Ctrl+3",
  refresh_news: "Ctrl+Shift+R",
  open_settings: "Ctrl+4",
};

type ComboEvent = Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "key">;

/** KeyboardEvent → 规范化组合键（修饰键顺序 Ctrl+Alt+Shift+Meta）。 */
export function eventToCombo(e: ComboEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

/** 焦点在可编辑控件内时不应触发快捷键。 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    // 用 contentEditable 字符串（"true"/"false"/"inherit"）而非 isContentEditable，
    // 保证浏览器与 jsdom 测试环境行为一致
    target.contentEditable === "true"
  );
}

/** 返回占用 combo 的动作（exclude 排除自身）；无冲突返回 null。 */
export function findDuplicateCombo(
  combo: string,
  map: ShortcutMap,
  exclude?: ShortcutAction,
): ShortcutAction | null {
  const c = combo.trim();
  if (!c) return null;
  for (const action of SHORTCUT_ACTIONS) {
    if (action === exclude) continue;
    if (map[action] === c) return action;
  }
  return null;
}

export function isDefaultShortcuts(map: ShortcutMap): boolean {
  return SHORTCUT_ACTIONS.every((a) => map[a] === DEFAULT_SHORTCUTS[a]);
}
