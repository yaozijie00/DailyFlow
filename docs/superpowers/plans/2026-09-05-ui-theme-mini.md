# DailyFlow UI 视觉升级 + Mini 窗完善 实现计划（V2.4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全应用三主题（浅色/深色/毛玻璃）视觉升级 + 自绘标题栏 + Mini 窗重设计（明显入口 + 内容增强）。

**Architecture:** 语义 token（CSS 变量，`@theme` + `.dark`/`.glass` 覆盖）→ 主题解析器 `theme.ts`（设置键 `theme_mode` + 系统跟随）→ 全量迁移 neutral 字面类为语义类 → Rust 无边框窗口 + 窗口 commands → TitleBar/Mini 前端组件。数据流不变（全部走既有 Core Service）。

**Tech Stack:** Tailwind CSS v4（`@theme`/`@custom-variant`）、React 19、Zustand、Tauri 2（Rust commands、WebviewWindow）、vitest/jsdom、better-sqlite3（测试）。

**设计文档:** `docs/superpowers/specs/2026-09-05-ui-theme-mini-design.md`（用户已批准）

**验证命令基线：**
- 单测：`node node_modules/vitest/vitest.mjs run <file>`
- 全量：`node node_modules/vitest/vitest.mjs run`（期望 721+ 全过）
- 类型：`node node_modules/typescript/bin/tsc --noEmit`（期望 0 错误）
- Rust：`cargo test --quiet`（期望全过）；构建：`cargo check`
- 前端构建：`node node_modules/vite/bin/vite.js build`
- Windows 沙箱下 node/cargo/git 需 `sandbox_permissions: danger-full-access`；git 需 `-c safe.directory=E:/03_Project/Programming/PJ_DailyFlow`
- 用户实机预览：`dev.bat`（`npm run tauri dev`），改 Rust 自动重编译重启

---

## 子系统划分与顺序（每子计划独立可验证）

| # | 子计划 | 产出 | 依赖 |
|---|---|---|---|
| P1 | 主题基建 | 三主题切换生效（浅色视觉不变、深色/玻璃可用）+ 设置 UI + 测试 | 无 |
| P2 | 框架迁移 | Layout/标题栏/Toasts/全局组件语义化 + 自绘标题栏（Rust 无边框） | P1 |
| P3 | 页面迁移 | Today/Focus/Goals/Statistics/Settings 及扩展组件语义化 | P1 |
| P4 | Mini 窗 | Mini 入口（关闭转 Mini + 标题栏按钮 + 托盘改名）+ 内容（倒计时圆环/进度环/快加）+ 视觉 | P1+P2 |

执行顺序 P1 → P2 → P3 → P4；P2/P3 可并行推进但建议顺序做以降低回归面。

---

## 语义 Token 映射表（全计划共用；P1 定义，P2/P3 逐文件替换）

旧类（删除）→ 新语义类（在目标文件替换）：

| 旧 | 新 |
|---|---|
| `bg-white`（卡片/面板） | `bg-surface` |
| `bg-white`（页面容器外其余） | 逐处判断：页面底 `bg-bg-app` |
| `bg-neutral-50` | `bg-surface-muted` 或 `bg-surface-hover`（按语境） |
| `bg-neutral-100` | `bg-surface-muted`（分区底）或 `bg-surface-hover`（hover） |
| `bg-neutral-100/70` | `bg-surface-hover/70` |
| `bg-neutral-900`（主按钮/激活） | `bg-accent`（primary 按钮、激活导航、强调） |
| `bg-neutral-900/30`（focus ring） | `ring-accent/30`（或 `focus-visible:ring-accent/30`） |
| `bg-neutral-50`（淡强调底，如 AppearanceSection 选中） | `bg-accent-soft` |
| `text-neutral-900` | `text-primary` |
| `text-neutral-800` | `text-primary` |
| `text-neutral-700` | `text-secondary` |
| `text-neutral-600` | `text-secondary` |
| `text-neutral-500` | `text-muted` |
| `text-neutral-400` | `text-faint` |
| `text-white`（主按钮文字/深底文字） | `text-on-accent` |
| `border-neutral-200` | `border-subtle` |
| `border-neutral-300`（输入框/描边按钮） | `border-strong` |
| `border-neutral-100`（细分隔） | `border-subtle`（透明度差异由主题变量） |
| `hover:bg-neutral-100` / `hover:bg-neutral-50` | `hover:bg-surface-hover` |
| `hover:text-neutral-700/900` | `hover:text-primary`（按语境） |
| `accent-neutral-900`（checkbox/radio） | `accent-accent` |
| `ring-neutral-900/30` | `ring-accent/30` |
| `divide-neutral-200`/`divide-neutral-100` | `divide-border-subtle` |
| 语义保持类（不换）：`bg-red-*`（danger）、`text-red-*`、`bg-green-*`（成功）、`text-green-*`、`bg-amber-*`（警告）、番茄钟暖色进度、分类彩色点、优先级色 |

**注意（重要）：** 迁移时不得改变布局类（`flex/grid/p-*/m-*/w-*/gap-*`）。纯视觉类才换。danger/success/warning 色保留原 Tailwind 色（未来若需深色微调再单独处理，本轮 `red/green/amber` 在深色下用原色即可读）。

---

# P1 主题基建

## Task P1-1: 语义 token + 三主题 CSS 变量（index.css）

**Files:**
- Modify: `src/index.css`（整体重写）

**步骤：**

- [ ] **Step 1: 重写 `src/index.css`**

```css
@import "tailwindcss";

/* Tailwind v4：dark 变体改为 class 驱动（html.dark），便于 JS 控制 */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* 让 Tailwind 为语义 token 生成工具类（值在 :root/.dark/.glass 覆盖） */
  --color-bg-app: #fafaf9;
  --color-surface: #ffffff;
  --color-surface-hover: #f5f5f4;
  --color-surface-muted: #f5f5f4;
  --color-bg-elevated: #ffffff;
  --color-border-subtle: #e7e5e4;
  --color-border-strong: #d6d3d1;
  --color-text-primary: #1c1917;
  --color-text-secondary: #44403c;
  --color-text-muted: #78716c;
  --color-text-faint: #a8a29e;
  --color-accent: #4f46e5;
  --color-accent-hover: #4338ca;
  --color-accent-soft: #eef2ff;
  --color-accent-strong: #818cf8; /* 深底上的强调文字 */
  --color-on-accent: #ffffff;
  --color-danger: #dc2626;
  --color-danger-soft: #fef2f2;

  /* 间距/圆角/阴影语义（沿用 A2 加细） */
  --spacing-page-x: 1.5rem;
  --spacing-section: 1.25rem;
  --radius-card: 0.75rem;
  --radius-control: 0.5rem;
  --shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06);
  --shadow-popover: 0 10px 30px -6px rgb(0 0 0 / 0.18);
}

/* 浅色（:root 默认即浅色；值覆盖 @theme 同变量即可） */
:root {
  --color-bg-app: #fafaf9;
  --color-surface: #ffffff;
  --color-surface-hover: #f5f5f4;
  --color-surface-muted: #f5f5f4;
  --color-bg-elevated: #ffffff;
  --color-border-subtle: #e7e5e4;
  --color-border-strong: #d6d3d1;
  --color-text-primary: #1c1917;
  --color-text-secondary: #44403c;
  --color-text-muted: #78716c;
  --color-text-faint: #a8a29e;
  --color-accent: #4f46e5;
  --color-accent-hover: #4338ca;
  --color-accent-soft: #eef2ff;
  --color-accent-strong: #4f46e5;
  --color-on-accent: #ffffff;
  color-scheme: light;
}

/* 深色（html.dark） */
html.dark {
  --color-bg-app: #16161a;
  --color-surface: #202027;
  --color-surface-hover: #2a2a33;
  --color-surface-muted: #1b1b21;
  --color-bg-elevated: #26262e;
  --color-border-subtle: #32323c;
  --color-border-strong: #454550;
  --color-text-primary: #f4f4f5;
  --color-text-secondary: #d4d4d8;
  --color-text-muted: #a1a1aa;
  --color-text-faint: #71717a;
  --color-accent: #6366f1;
  --color-accent-hover: #818cf8;
  --color-accent-soft: rgb(99 102 241 / 0.16);
  --color-accent-strong: #a5b4fc;
  --color-on-accent: #ffffff;
  color-scheme: dark;
}

/* 毛玻璃（html.glass）：背景层渐变 + 噪点；玻璃卡片由 .glass-surface 提供 */
html.glass {
  --color-bg-app: #ede9fe; /* 兜底底色（渐变覆盖其上） */
  --color-surface: rgb(255 255 255 / 0.62);
  --color-surface-hover: rgb(255 255 255 / 0.78);
  --color-surface-muted: rgb(255 255 255 / 0.4);
  --color-bg-elevated: rgb(255 255 255 / 0.82);
  --color-border-subtle: rgb(255 255 255 / 0.5);
  --color-border-strong: rgb(120 113 108 / 0.35);
  --color-text-primary: #1c1917;
  --color-text-secondary: #44403c;
  --color-text-muted: #57534e;
  --color-text-faint: #78716c;
  --color-accent: #4f46e5;
  --color-accent-hover: #4338ca;
  --color-accent-soft: rgb(79 70 229 / 0.14);
  --color-accent-strong: #4f46e5;
  --color-on-accent: #ffffff;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  html.glass {
    --color-bg-app: #1e1b2e;
    --color-surface: rgb(30 27 46 / 0.6);
    --color-surface-hover: rgb(40 37 60 / 0.72);
    --color-surface-muted: rgb(24 22 38 / 0.45);
    --color-bg-elevated: rgb(38 35 58 / 0.8);
    --color-border-subtle: rgb(255 255 255 / 0.14);
    --color-border-strong: rgb(255 255 255 / 0.26);
    --color-text-primary: #f4f4f5;
    --color-text-secondary: #d4d4d8;
    --color-text-muted: #a1a1aa;
    --color-text-faint: #71717a;
    color-scheme: dark;
  }
}

/* 毛玻璃背景层：固定全屏渐变 + 噪点；z 序在内容之下 */
html.glass body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(1200px 800px at 12% -10%, rgb(233 213 255 / 0.7), transparent 60%),
    radial-gradient(1000px 700px at 110% 15%, rgb(199 210 254 / 0.65), transparent 55%),
    radial-gradient(900px 900px at 50% 120%, rgb(254 215 170 / 0.4), transparent 60%),
    linear-gradient(160deg, #faf5ff 0%, #f5f3ff 45%, #eef2ff 100%);
}
@media (prefers-color-scheme: dark) {
  html.glass body::before {
    background:
      radial-gradient(1100px 800px at 10% -8%, rgb(76 29 149 / 0.55), transparent 60%),
      radial-gradient(900px 700px at 112% 12%, rgb(30 58 138 / 0.55), transparent 55%),
      radial-gradient(800px 800px at 45% 120%, rgb(30 27 75 / 0.8), transparent 62%),
      linear-gradient(160deg, #17122b 0%, #1b1635 45%, #10182f 100%);
  }
}

/* 玻璃卡片工具类：半透明 + 背景模糊 + 细描边（P2/P4 使用） */
@layer utilities {
  .glass-surface {
    background: var(--color-surface);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid var(--color-border-subtle);
  }
}

/* 页内容器统一契约（沿用 A2） */
@layer components {
  .df-page {
    @apply mx-auto w-full max-w-5xl;
  }
}
```

- [ ] **Step 2: 验证 CSS 无语法破坏**

Run: `node node_modules/vite/bin/vite.js build`
Expected: BUILD=0（CSS 编译通过；页面颜色此时浅色=原视觉近似）

---

## Task P1-2: 主题解析器 `src/lib/theme.ts` + 测试

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

**步骤：**

- [ ] **Step 1: 写测试（先红）**

`src/lib/theme.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveThemeClass,
  parseThemeMode,
  THEME_MODES,
  type ThemeMode,
} from "./theme";

describe("parseThemeMode", () => {
  it("合法值原样返回", () => {
    for (const m of THEME_MODES) expect(parseThemeMode(m)).toBe(m);
  });
  it("非法/缺失回退 system", () => {
    expect(parseThemeMode(undefined)).toBe("system");
    expect(parseThemeMode(null)).toBe("system");
    expect(parseThemeMode("neon" as ThemeMode)).toBe("system");
    expect(parseThemeMode("")).toBe("system");
  });
});

describe("resolveThemeClass（纯决策：设置 × 系统深浅 → html class）", () => {
  afterEach(() => vi.restoreAllMocks());

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

describe("applyTheme（DOM 副作用：写 html class 与 meta）", () => {
  it("设置 documentElement.className 仅含目标类（不破坏既有类）", () => {
    document.documentElement.className = "existing";
    const { applyTheme } = require("./theme") as typeof import("./theme");
    applyTheme("dark", false);
    expect(document.documentElement.className).toContain("existing");
    expect(document.documentElement.className).toContain("dark");
    applyTheme("light", false);
    expect(document.documentElement.className).not.toContain("dark");
    expect(document.documentElement.className).toContain("existing");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node node_modules/vitest/vitest.mjs run src/lib/theme.test.ts`
Expected: FAIL（theme 模块不存在）

- [ ] **Step 3: 实现 `src/lib/theme.ts`**

```ts
/** 主题模式（设置持久化值）：system=跟随系统；light/dark/glass=显式。 */
export type ThemeMode = "system" | "light" | "dark" | "glass";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark", "glass"];

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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node node_modules/vitest/vitest.mjs run src/lib/theme.test.ts`
Expected: PASS

---

## Task P1-3: settings 增加 `theme_mode` 键（service + 默认 + 校验）

**Files:**
- Modify: `src/services/settingsService.ts`
- Modify: `src/services/settingsService.test.ts`

**步骤：**

- [ ] **Step 1: 在 settingsService.ts 增加类型/默认/键/校验/读写**

在 `AppSettings` 接口内（`defaultLayoutMode` 后）加：
```ts
  /** 界面主题：system=跟随系统 | light | dark | glass（毛玻璃） */
  themeMode: ThemeMode;
```
顶部 `import` 区加：
```ts
import { isThemeMode, type ThemeMode } from "../lib/theme";
```
`DEFAULT_SETTINGS` 加：
```ts
  themeMode: "system",
```
键常量区加：
```ts
const KEY_THEME_MODE = "theme_mode";
```
`getSettings()` 返回对象加：
```ts
      themeMode: isThemeMode(stored[KEY_THEME_MODE])
        ? stored[KEY_THEME_MODE]
        : DEFAULT_SETTINGS.themeMode,
```
`update()` writes 数组前加（`defaultLayoutMode` 分支后）：
```ts
    if (partial.themeMode !== undefined && isThemeMode(partial.themeMode)) {
      writes.push([KEY_THEME_MODE, partial.themeMode]);
    }
```

- [ ] **Step 2: 扩展 settingsService.test.ts**

在现有「读取回退默认」类测试后加用例（参考现有 `repo.set("layout_mode","ultra")` 模式，插入同 describe）：
```ts
  it("theme_mode：缺失/非法回退 system，合法值读回", async () => {
    const { db, close, service } = ...; // 沿用文件既有构造模式
    const s1 = await service.getSettings();
    expect(s1.themeMode).toBe("system");
    await repo.set("theme_mode", "glass");
    expect((await service.getSettings()).themeMode).toBe("glass");
    await repo.set("theme_mode", "neon");
    expect((await service.getSettings()).themeMode).toBe("system");
  });
```
（以该测试文件既有 `beforeEach` 构造为准；若文件用 `createSettingsService()` 辅助则沿用。）

- [ ] **Step 3: 跑测试**

Run: `node node_modules/vitest/vitest.mjs run src/services/settingsService.test.ts src/lib/theme.test.ts`
Expected: PASS

---

## Task P1-4: 主题应用接线（settingsStore 启动 + main.tsx + 设置即时切换）

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

**步骤：**

- [ ] **Step 1: settingsStore.load 成功后应用主题；update 后同步**

`src/stores/settingsStore.ts` 顶部 import：
```ts
import { applyTheme, parseThemeMode, systemPrefersDark, watchSystemTheme } from "../lib/theme";
```
模块内（create 之前）加辅助：
```ts
let stopWatchSystem: (() => void) | null = null;

/** 依据当前设置 + 系统深浅把主题类写到 <html>；注册系统跟随监听。 */
function syncTheme(mode: string | null | undefined): void {
  applyTheme(parseThemeMode(mode ?? null), systemPrefersDark());
}
```
`load()` 成功分支（`set({ settings, shortcuts, loaded: true })` 后）加：
```ts
      syncTheme(settings.themeMode);
      if (!stopWatchSystem) {
        stopWatchSystem = watchSystemTheme(() => {
          const m = useSettingsStore.getState().settings.themeMode;
          if (m === "system") syncTheme(m); // 仅跟随系统模式需要实时响应
        });
      }
```
`update()` 成功（`set({ settings })` 后）加：
```ts
      syncTheme(settings.themeMode);
```

- [ ] **Step 2: main.tsx 渲染前先按存储主题设初值（避免闪烁）**

`src/main.tsx` 中 import settingsStore 之前（顶部 import 区）加：
```ts
import { parseThemeMode, applyTheme, systemPrefersDark } from "./lib/theme";
```
在 `const isMini = detectIsMini();` 后、render 前加（同步读本地已缓存值，异步读 DB 由 settingsStore.load 校正）：
```ts
// 主题初值：先按系统偏好给默认（深色/浅色），DB 加载后 settingsStore 校正
applyTheme(parseThemeMode(null), systemPrefersDark());
```
（加载完成后 settingsStore.load 会按持久化 `theme_mode` 覆盖；跟随系统模式下监听也由 syncTheme 注册。）

- [ ] **Step 3: 验证 tsc + 相关测试**

Run: `node node_modules/typescript/bin/tsc --noEmit` → TSC=0
Run: `node node_modules/vitest/vitest.mjs run src/stores src/services/settingsService.test.ts src/lib/theme.test.ts` → PASS

---

## Task P1-5: 设置页「外观」增加主题选择 UI

**Files:**
- Modify: `src/components/settings/AppearanceSection.tsx`

**步骤：**

- [ ] **Step 1: 在「默认视图模式」区块前插入主题区块**

AppearanceSection.tsx 顶部 import 加：
```ts
import { THEME_MODES, type ThemeMode } from "../../lib/theme";
```
组件 return 的最外层 `<div>` 开头（`<div className="space-y-4 ...">` 之后、原「默认视图模式」div 之前）插入：
```tsx
      <div>
        <div className="text-sm text-neutral-700">界面主题</div>
        <p className="mt-0.5 text-xs text-neutral-400">
          跟随系统 / 浅色 / 深色 / 毛玻璃。毛玻璃在窗口内营造柔和磨砂质感。
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {THEME_MODES.map((m) => {
            const label =
              m === "system" ? "跟随系统" : m === "light" ? "浅色" : m === "dark" ? "深色" : "毛玻璃";
            const desc =
              m === "system"
                ? "自动随 Windows 深浅色切换（浅色/深色）"
                : m === "light"
                  ? "明亮、暖白底 + 靛蓝强调"
                  : m === "dark"
                    ? "深炭底，护眼低亮"
                    : "柔和渐变底 + 半透明磨砂卡片";
            return (
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
                  <span className="block text-primary">{label}</span>
                  <span className="block text-xs text-muted">{desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
```
组件内加 handler：
```ts
  const handleThemeChange = async (m: ThemeMode) => {
    await update({ themeMode: m }); // settingsStore.update 内已 syncTheme
  };
```
（本任务内其余元素暂保持旧 neutral 类，P3 统一迁移。）

- [ ] **Step 2: tsc + 相关测试**

Run: `node node_modules/typescript/bin/tsc --noEmit` → 0
Run: `node node_modules/vitest/vitest.mjs run src/components src/stores` → PASS

---

## P1 验证收口

- [ ] 全量 `vitest` 通过；`tsc` 0；`vite build` 0；`cargo test` 全过（未动 Rust 也应过）
- [ ] 用户实机（dev.bat）：设置 → 外观 → 切「深色」全界面变深；切「毛玻璃」出现渐变底 + 玻璃卡片；重启后保持（theme_mode 持久化）；Windows 系统深浅切换在「跟随系统」下实时响应

---

# P2 框架迁移（Layout / 标题栏 / 全局组件 / 自绘标题栏）

> P2 前先确认 P1 视觉正确。P2 将 Layout、TitleBar（新）、Toasts、GlobalFocusBar、CommandPalette、QuickCapture、UndoButtons、CloseBehaviorDialog、components/ui/* 替换为语义类，并实现自绘标题栏。

## Task P2-1: 自绘标题栏 Rust 侧（无边框 + commands）

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: tauri.conf.json 主窗 `decorations:false`**

`app.windows[0]` 增加 `"decorations": false`；标题栏由前端渲染（含拖拽区）。Mini 窗在 lib.rs `open_mini_window` 的 Builder 已 `decorations(true)` → 改 `decorations(false)`。

- [ ] **Step 2: lib.rs 增加窗口控制 commands**

```rust
/// 标题栏按钮：最小化主窗。
#[tauri::command]
fn window_minimize(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.minimize();
    }
}

/// 标题栏按钮：最大化/还原主窗。
#[tauri::command]
fn window_maximize_toggle(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) {
            let _ = w.unmaximize();
        } else {
            let _ = w.maximize();
        }
    }
}

/// 标题栏 Mini 按钮：主窗 ⇄ Mini 切换（开→隐藏主窗显 Mini；Mini 已开→还原主窗）。
#[tauri::command]
fn toggle_mini_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(mini) = app.get_webview_window(MINI_WINDOW_LABEL) {
        if mini.is_visible().unwrap_or(false) {
            close_mini_window(app);
        } else {
            open_mini_window(app)?;
        }
    } else {
        open_mini_window(app)?;
    }
    Ok(())
}
```
在 `invoke_handler` 数组注册：`window_minimize, window_maximize_toggle, toggle_mini_window,`。
（若 Rust 侧无法精确读 is_visible，可用简化：always open_mini_window；前端状态兜底。）

- [ ] **Step 3: cargo check**

Run（workdir src-tauri）：`cargo check` → 0 errors

## Task P2-2: TitleBar 组件 + Layout 挂载 + Mini 入口按钮

**Files:**
- Create: `src/components/TitleBar.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: 创建 `TitleBar.tsx`**

```tsx
import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, Copy, X } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { hideToTray, exitApp } from "../services/windowBehaviorService";

/** 自绘标题栏：拖拽区 + 右侧 Mini/最小化/最大化/关闭。
 *  关闭行为沿用设置（exit→退出；tray→隐藏；mini→转 Mini）。 */
export default function TitleBar() {
  const closeBehavior = useSettingsStore((s) => s.settings.closeBehavior);
  const runClose = () => {
    if (closeBehavior === "tray") hideToTray();
    else if (closeBehavior === "mini") void invoke("toggle_mini_window");
    else exitApp();
  };
  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle bg-surface pl-4 select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 text-sm font-medium text-primary">
        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        DailyFlow
      </div>
      <div className="flex items-center" data-tauri-drag-region={false}>
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
      className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:bg-surface-hover hover:text-primary"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Layout 挂载 TitleBar（body 最外层改为纵向 flex：标题栏在上，原内容在下）**

`Layout.tsx` import：`import TitleBar from "./TitleBar";`
`return` 改为：
```tsx
    <div className="flex h-screen flex-col bg-bg-app text-primary" data-layout-mode={layoutMode}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {/* 原 aside + main 内容原样放入 */}
      </div>
    </div>
```
（保持 aside/main 内部布局；原最外层横向 flex 现在包在第二层。）

- [ ] **Step 3: tsc + vitest（Layout.test 可能需适配背景类断言；更新断言为语义类）**

Run tsc；Run `node node_modules/vitest/vitest.mjs run src/components/Layout.test.tsx` → 通过（若断言 bg-white 等则改）。

## Task P2-3: 全局组件语义化（components/ui/* + Layout 侧栏 + 全局浮层）

**Files:** 逐文件将「旧→新」映射表应用到：
- `src/components/Layout.tsx`（aside 背景/导航按钮/分组标题/DB 状态行）
- `src/components/ui/Button.tsx`、`Input.tsx`、`Select.tsx`、`Card.tsx`、`PageHeader.tsx`、`IconButton.tsx`、`Dialog.tsx`、`EmptyState.tsx`、`ErrorState.tsx`、`LoadingState.tsx`
- `src/components/Toasts.tsx`、`GlobalFocusBar.tsx`、`CommandPalette.tsx`、`QuickCapture.tsx`、`UndoButtons.tsx`、`CloseBehaviorDialog.tsx`、`ErrorBoundary.tsx`

替换时遵循：主按钮/激活 `bg-neutral-900`→`bg-accent`；文字/表面按映射表；danger/success 语义色保留。每文件替换后 `tsc` 过即可（视觉正确性在实机验证）。

- [ ] **Step 1~N: 逐文件替换（每 2-3 个文件一次 tsc+相关测试）**
- [ ] **Step 末: 全量 vitest + tsc + vite build 通过**

---

# P3 页面迁移（Today/Focus/Goals/Statistics/Settings + 扩展）

按映射表逐文件替换下列页面与页内组件（每页后 vitest 该页相关测试 + tsc）：
- Today：`src/pages/Today.tsx`、`src/components/today/*`、`src/components/tasks/*`、`src/components/timeline/*`、`src/components/notes/*`、`src/components/today/*`
- Focus：`src/pages/Focus.tsx`、`src/components/focus/*`、`src/components/pomodoro/*`（PomodoroPanel PRIMARY_BTN 常量 → `bg-accent`）
- Goals：`src/pages/Goals.tsx`、`src/components/goals/*`
- Statistics：`src/pages/Statistics.tsx`、`src/components/statistics/*`、成就组件
- Settings：`src/pages/Settings.tsx`、`src/components/settings/*`（含 P1-5 已改的 AppearanceSection 内残留 neutral 类收口）
- 扩展：`src/extensions/builtin/course-schedule/*`、`src/extensions/builtin/workflow/*`
- 卡片阴影：`shadow` 统一为 `shadow-card`；浮层 `shadow-xl`→`shadow-popover`

验证：每页替换后跑该页 vitest（`src/pages/*.test.tsx` 等）+ tsc；全部完成后全量回归 + 实机三主题视觉检查。

---

# P4 Mini 窗（重设计 + 入口）

## Task P4-1: 关闭行为新增「转 Mini」

**Files:**
- Modify: `src/services/settingsService.ts`（`CloseBehavior` 类型加 `"mini"`；`DEFAULT_SETTINGS.closeBehavior` 保持 `"exit"`；读取/写入校验处：`stored[...] === "tray" ? "tray" : ...` → 支持 `"mini"`）
- Modify: `src/services/windowBehaviorService.ts`（`CloseAction` 加 `"mini"`；`resolveCloseAction`：`behavior === "mini" → "mini"`；handleCloseRequest case 调 `invoke("toggle_mini_window")`）
- Modify: `src/components/settings/CloseBehaviorDialog.tsx`（三选 radio + label「关闭时转迷你窗」；confirmFirst 分支）
- Test: `src/services/windowBehaviorService` 相关测试文件（若有）补 `mini` 分支用例；无则 settingsService.test 覆盖类型

## Task P4-2: Mini 视觉与结构重设计

**Files:**
- Modify: `src/pages/MiniApp.tsx`（整体重写为：迷你标题栏 → 专注倒计时圆环卡 → 今日进度环卡 → 快速添加输入框 → 任务列表）
- Modify: `src-tauri/src/lib.rs` `open_mini_window`（尺寸 360×560、`decorations(false)`、title「DailyFlow Mini」）
- Create: `src/components/mini/FocusRing.tsx`（SVG 圆环：进度/剩余，props: progress 0-1, size, stroke, children）
- Create: `src/components/mini/ProgressRing.tsx`（同圆环复用或参数化）

MiniApp 数据流：`taskService.getTasksByDate(today)`；快加 `taskService.createTask`（沿用 A4 模式与 `undoActions` 无关，直接 service）；专注：`usePomodoroStore` 只读 snapshot + pause/resume/startFocus；跨窗 `invoke("notify_tasks_changed")`。测试：`src/pages/MiniApp.test.tsx`（沿用 A4 模式 mock service/store 渲染三项内容 + 快加提交）。

## Task P4-3: Mini 入口收口 + 回归

- 托盘「打开 Mini 窗」改名「切换迷你窗」；标题栏 Mini 按钮已含（P2-2）；关闭转 Mini 已含（P4-1）。
- 全量回归：vitest + tsc + cargo test + vite build。
- 实机验证清单：标题栏拖拽/双击最大化；Mini 打开/快加/专注控制/完成刷新主窗；三主题下 Mini 视觉。

---

## 全局验证收口（P1-P4 全部完成后）

- [ ] `vitest` 全量（预期 721+ 新增用例）全过
- [ ] `tsc --noEmit` 0 错误
- [ ] `cargo test --quiet` 全过；`cargo check` 0 错误
- [ ] `vite build` 0 错误
- [ ] 实机（dev.bat）手工清单：
  1. 三主题切换（设置→外观）即时生效且重启保持；system 跟随系统
  2. 毛玻璃：渐变底 + 玻璃卡片 blur 正常；时间轴/任务列表可读性 OK；滚动性能正常
  3. 标题栏：拖拽移动、双击最大化、按钮工作、关闭行为三选（exit/tray/转 Mini）生效
  4. Mini：360×560、置顶；专注倒计时环同步主窗；今日进度环正确；快加任务后主窗同步出现；完成按钮广播刷新
  5. 回归抽查：统计图/成就/工作流页面颜色协调；深色下 danger/success 可读
