// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  eventToCombo,
  findDuplicateCombo,
  isDefaultShortcuts,
  isEditableTarget,
} from "./shortcuts";

describe("eventToCombo", () => {
  test("Ctrl+T", () => {
    expect(eventToCombo({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "t" })).toBe("Ctrl+T");
  });
  test("Ctrl+Shift+T", () => {
    expect(eventToCombo({ ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, key: "T" })).toBe("Ctrl+Shift+T");
  });
  test("Ctrl+Space 空格归一化", () => {
    expect(eventToCombo({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: " " })).toBe("Ctrl+Space");
  });
  test("Meta+ArrowUp 原样保留功能键", () => {
    expect(eventToCombo({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, key: "ArrowUp" })).toBe("Meta+ArrowUp");
  });
  test("无修饰键字母大写", () => {
    expect(eventToCombo({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: "a" })).toBe("A");
  });
});

describe("isEditableTarget", () => {
  test("input/textarea/select/contenteditable 为真", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isEditableTarget(div)).toBe(true);
  });
  test("普通 div/null 为假", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("findDuplicateCombo", () => {
  test("检测重复并返回占用动作", () => {
    const map = { ...DEFAULT_SHORTCUTS, create_task: DEFAULT_SHORTCUTS.open_today };
    expect(findDuplicateCombo(DEFAULT_SHORTCUTS.open_today, map)).toBe("create_task");
  });
  test("排除自身；空组合不检测", () => {
    expect(findDuplicateCombo(DEFAULT_SHORTCUTS.open_today, DEFAULT_SHORTCUTS, "open_today")).toBeNull();
    expect(findDuplicateCombo("", DEFAULT_SHORTCUTS)).toBeNull();
  });
});

describe("默认值", () => {
  test("默认快捷键无重复", () => {
    const values = SHORTCUT_ACTIONS.map((a) => DEFAULT_SHORTCUTS[a]);
    expect(new Set(values).size).toBe(values.length);
  });
  test("isDefaultShortcuts", () => {
    expect(isDefaultShortcuts(DEFAULT_SHORTCUTS)).toBe(true);
    expect(isDefaultShortcuts({ ...DEFAULT_SHORTCUTS, open_today: "Ctrl+9" })).toBe(false);
  });
});
