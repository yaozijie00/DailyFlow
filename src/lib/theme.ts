/** 主题模式（设置持久化值）：system=跟随系统；light/dark/glass=显式。 */
export type ThemeMode = "system" | "light" | "dark" | "glass";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark", "glass"];

export const APPEARANCE_STYLES = ["classic", "paper", "forest", "graphite"] as const;
export type AppearanceStyle = typeof APPEARANCE_STYLES[number];
export function isAppearanceStyle(value: unknown): value is AppearanceStyle {
  return typeof value === "string" && (APPEARANCE_STYLES as readonly string[]).includes(value);
}
export function applyAppearance(style: AppearanceStyle, mode: ThemeMode): void {
  // Keep the existing glass material intact; the chosen style is retained for other modes.
  document.documentElement.dataset.appearance = mode === "glass" ? "classic" : style;
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && (THEME_MODES as string[]).includes(v);
}

/** 非法/缺失回退 system（设置损坏或旧版本无此键时安全）。 */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return isThemeMode(raw) ? raw : "system";
}

/** 纯决策：给定设置模式与「系统是否深色」，返回应加到 <html> 的类（""=无）。 */
export function resolveThemeClass(mode: ThemeMode, systemDark: boolean): string {
  switch (mode) {
    case "light":
      return "";
    case "dark":
      return "dark";
    case "glass":
      return "glass";
    case "system":
    default:
      return systemDark ? "dark" : "";
  }
}

/** 系统当前是否深色（无 matchMedia 的环境按浅色处理）。 */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** 把主题类应用到 <html>（保留既有类；移除本模块管理的类）。 */
export function applyTheme(mode: ThemeMode, systemDark: boolean): void {
  const target = resolveThemeClass(mode, systemDark);
  const el = document.documentElement;
  const managed = ["dark", "glass"];
  const next = el.className
    .split(/\s+/)
    .filter((c) => c && !managed.includes(c))
    .concat(target ? [target] : []);
  el.className = next.join(" ");
}

/** 订阅系统深浅变化；返回取消函数。 */
export function watchSystemTheme(cb: (dark: boolean) => void): () => void {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => cb(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  } catch {
    return () => undefined;
  }
}
