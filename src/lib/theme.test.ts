// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  resolveThemeClass,
  parseThemeMode,
  THEME_MODES,
  applyTheme,
  applyAppearance,
  APPEARANCE_STYLES,
  type ThemeMode,
} from "./theme";
it("keeps appearance independent of theme and restores preference after glass", () => {
  for (const style of APPEARANCE_STYLES) {
    applyTheme("dark",false); applyAppearance(style,"dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.appearance).toBe(style);
    applyAppearance(style,"glass"); expect(document.documentElement.dataset.appearance).toBe("classic");
    applyAppearance(style,"light"); expect(document.documentElement.dataset.appearance).toBe(style);
  }
});

describe("parseThemeMode", () => {
  it("合法值原样返回", () => {
    for (const m of THEME_MODES) expect(parseThemeMode(m)).toBe(m);
  });
  it("非法/缺失回退 system", () => {
    expect(parseThemeMode(undefined)).toBe("system");
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode("neon" as ThemeMode)).toBe("system");
    expect(parseThemeMode("")).toBe("system");
    expect(parseThemeMode(42 as unknown as string)).toBe("system");
  });
});

describe("resolveThemeClass（纯决策：设置 × 系统深浅 → html class）", () => {
  it("light → 移除全部主题类（空）", () => {
    expect(resolveThemeClass("light", false)).toBe("");
    expect(resolveThemeClass("light", true)).toBe("");
  });
  it("dark → 'dark'（不随系统）", () => {
    expect(resolveThemeClass("dark", false)).toBe("dark");
    expect(resolveThemeClass("dark", true)).toBe("dark");
  });
  it("glass → 'glass'（亮暗玻璃由 CSS media 自适应）", () => {
    expect(resolveThemeClass("glass", false)).toBe("glass");
    expect(resolveThemeClass("glass", true)).toBe("glass");
  });
  it("system → 跟随系统：暗='dark'，亮=''", () => {
    expect(resolveThemeClass("system", true)).toBe("dark");
    expect(resolveThemeClass("system", false)).toBe("");
  });
});

describe("applyTheme（DOM 副作用：写 html class，保留既有类）", () => {
  afterEach(() => {
    document.documentElement.className = "";
  });

  it("dark 时保留既有类并追加 dark", () => {
    document.documentElement.className = "existing";
    applyTheme("dark", false);
    const cls = document.documentElement.className.split(/\s+/);
    expect(cls).toContain("existing");
    expect(cls).toContain("dark");
  });

  it("light 移除 dark/glass 但保留既有类", () => {
    document.documentElement.className = "existing dark";
    applyTheme("light", true);
    const cls = document.documentElement.className.split(/\s+/);
    expect(cls).toContain("existing");
    expect(cls).not.toContain("dark");
    expect(cls).not.toContain("glass");
  });

  it("glass 追加 glass 并移除 dark", () => {
    document.documentElement.className = "dark";
    applyTheme("glass", false);
    const cls = document.documentElement.className.split(/\s+/);
    expect(cls).toContain("glass");
    expect(cls).not.toContain("dark");
  });

  it("system + 系统暗 → dark", () => {
    applyTheme("system", true);
    expect(document.documentElement.className.split(/\s+/)).toContain("dark");
  });
});
