# DailyFlow UI 视觉升级 + Mini 窗完善 设计文档（V2.4）

- 日期：2026-09-05
- 状态：待实现（经用户逐项确认）
- 目标版本：2.4.0（UI 层，不改业务逻辑/DB schema）

## 1. 背景与目标

当前 DailyFlow 为纯黑白灰单色系（约 794 处 neutral 灰阶类、accent 均为 neutral-900），无主题色、无暗色模式、无渐变，观感朴素。A2 已建立 design tokens 骨架（`src/index.css`），但缺完整视觉层。

Mini 窗口（A4 已实现）入口仅在系统托盘右键菜单「打开 Mini 窗」，用户不易发现；内容仅今日任务四项，较为简陋。

本轮目标：
1. 全应用视觉升级：现代效率工具美学 + 靛蓝强调 + 三主题（浅色 / 深色 / 毛玻璃）。
2. 自绘标题栏。
3. Mini 窗口：明显入口 + 内容增强 + 视觉同源重设计。

硬约束：不破坏现有功能与数据；改动可验证（vitest/tsc/cargo/vite build 全绿）；过程如实汇报；无指示不提交不打包。

## 2. 设计语言总纲

**风格基准**：现代「效率工具」美学（Linear / Notion / Things 一类）：大面积留白、低饱和表面色、克制而精确的靛蓝强调、细腻层级阴影、圆角体系、精致中文排版。

参考项目：
- [Tauri UI starter（shadcn/ui 桌面布局）](https://www.shadcndirectory.com/products/shadcn_directory_npmjs_tauri_ui/)
- [Notion 风格生产力参考](https://github.com/ruslanlap/NotionTODO)
- [Litask — 现代 TODO 视觉](https://github.com/neptotech/litask)
- [Just-Do-It — 玻璃拟态](https://github.com/bylukeO/Just-Do-It-)

## 3. 主题系统（三主题，全量语义 token 化）

### 3.1 Token 三层结构（`src/index.css` `@theme` 扩展）

- **Surface（表面）**：`--color-surface`（卡片/面板）、`--color-surface-hover`、`--color-surface-muted`（分区底）、`--color-bg-app`（页面底）、`--color-bg-elevated`（浮层/弹窗）。
- **Text（文字四级）**：`--color-text-primary / secondary / muted / faint`。
- **Border**：`--color-border-subtle`（分隔）、`--color-border-strong`（输入框）。
- **Accent（靛蓝强调）**：`--color-accent-DEFAULT`（600）、`--color-accent-hover`（500）、`--color-accent-soft`（淡底 100）、`--color-accent-strong`（700，用于深底上的强调）。
- **Radii/Shadow 语义**：`--radius-card`（0.75rem 视觉升级）、`--radius-control`（0.5rem）、层级阴影 `--shadow-card` / `--shadow-popover`。

### 3.2 三主题定义

| 主题 | 机制 | 值 |
|---|---|---|
| light（浅色） | `:root` 默认 | 暖白背景（如 `#fafaf9`）、白色卡片、靛蓝强调 |
| dark（深色） | `html.dark` | 深炭底（如 `#17171a` 系）、`neutral-800/900` 卡片、靛蓝 400/500 强调 |
| glass（毛玻璃） | `html.glass` + 跟随系统明暗自适配（`@media (prefers-color-scheme)` 内切换亮玻璃/暗玻璃变量） | 见 §3.3 |

`settings` 新增键 `theme_mode`：`"system" | "light" | "dark" | "glass"`（默认 `system`）。
- `system` = 跟随 `prefers-color-scheme` 切 light/dark（不进入 glass）。
- `light` / `dark` / `glass` = 显式指定。
- 生效：`index.html`/`main.tsx` 启动时读设置写 `document.documentElement` class；设置改动即时应用并持久化。

### 3.3 毛玻璃主题（应用内磨砂，Apple 风）

- **定义**：窗口内自造背景层——柔和多色渐变底（暖白 → 淡紫 → 淡靛大面积径向渐变，类似 macOS Sonoma 壁纸朦胧感）+ 细腻噪点纹理（SVG feTurbulence 或极低透明度噪点图）。
- **玻璃卡片**：卡片/侧栏/面板 = `rgba(255,255,255,0.55~0.7)`（暗玻璃用 `rgba(20,20,24,0.55)`）+ `backdrop-filter: blur(20px) saturate(140%)` + 1px 半透明描边（`rgba(255,255,255,0.4)` / 暗 `rgba(255,255,255,0.08)`）。
- **明暗自适配**：glass 主题下用 CSS 媒体查询切换亮/暗两套玻璃变量（背景渐变、玻璃透明度、文字色）。
- **适用范围**：全应用玻璃化（主窗侧栏/面板/卡片 + Mini 窗），但数据密集交互区（时间轴任务块、表格）在玻璃上保证对比度 ≥ 可读阈值（文字用不透明色，强调块保留实体底色）。
- **回退**：不支持 `backdrop-filter` 的环境（WebView2 现代版本均支持）降级为接近不透明的半透明白，保证可读。

### 3.4 迁移策略（全量语义 token 化）

现有 794 处 neutral 字面类迁移为语义类，分 5 批，每批 tsc + vitest 验证：
1. 基建：`index.css` token + 主题切换逻辑（`src/lib/theme.ts`）+ `main.tsx` 接入。
2. 全局框架：`Layout`/侧栏/标题栏/Toasts/GlobalFocusBar/CommandPalette/QuickCapture。
3. 通用组件：`components/ui/*`（Button/Dialog/Input/Select/Card/PageHeader…）、UndoButtons、CloseBehaviorDialog。
4. 页面：Today/Focus/Goals/Statistics/Settings 及页内组件。
5. 扩展 UI：course-schedule / workflow 组件（视觉同源）。

> 迁移时保留极少数刻意强调（如 danger 红、番茄钟暖色进度），它们以独立 token（`--color-danger-*`、`--color-focus-*`）纳入体系。

## 4. 自绘标题栏

- **窗口**：主窗与 Mini 窗 `decorations(false)`（Rust `tauri.conf.json` 窗口配置 / 构建时设置）。
- **前端实现**：`components/TitleBar.tsx`：
  - 左侧：应用标识「DailyFlow」+ 当前页名称（可点击回今日）。
  - 中部/空白：`data-tauri-drag-region` 拖拽区。
  - 右侧：Mini 切换按钮（靛蓝描边、悬停高亮）→ 最小化 → 最大化/还原 → 关闭（关闭行为按设置：转 Mini / 退出 / 托盘）。
- **Rust 侧**：
  - 窗口事件分流保留现有逻辑（label=main/mini）。
  - Windows 圆角/阴影：主窗与 Mini 使用系统级圆角（Win11 自动）+ 合理阴影；若圆角异常则退化标准无边框。
  - 新增 command：`toggle_mini_window`（Mini 开→隐藏主窗显示 Mini；关→还原主窗）、`window_minimize`/`window_maximize_toggle`（标题栏按钮直调，避免前端窗口 API 与拖拽区冲突）。
- **双窗标题栏**：Mini 窗自绘迷你标题条（无系统栏），含「← 主窗口」返回与关闭。

## 5. Mini 窗口（重设计）

### 5.1 入口（明显化）

1. **关闭行为新增「转 Mini」**：设置（关闭行为）三选扩展为：退出 / 最小化到托盘 / **关闭时转 Mini**（点 X → 隐藏主窗、显示 Mini；托盘常驻可还原）。默认仍 exit。
2. **标题栏 Mini 按钮**：主窗自绘标题栏内常驻（见 §4）。
3. **托盘保留**「打开 Mini 窗」并更名「切换迷你窗」；托盘功能与 Mini 共存。
4. 全局快捷键（可选后续）：如 `Ctrl+Shift+M`（本轮若时间允许再加）。

### 5.2 尺寸与结构

- 尺寸 320×480 → **360×560**（内容增加后保证可读），不可缩放、置顶、跳过任务栏（保持 A4 既有）。
- 视觉与主窗同源（同 token/强调色/圆角；玻璃主题下 Mini 同玻璃化）。
- 结构（自上而下）：
  1. 迷你标题栏（拖拽区 + 「← 主窗口」 + 关闭=还原主窗）。
  2. **专注倒计时圆环卡**：正在专注时显示剩余时间圆环 + 暂停/继续/跳过；空闲时显示「开始专注」入口（经 pomodoroStore，与主窗同步）。
  3. **今日进度环卡**：完成/总数 + 圆环 + 百分比；点卡片回主窗今日。
  4. **快速添加输入框**：输入回车 → `TaskService.createTask`（今日、无类别默认）→ 刷新列表 + 广播 `df:tasks-changed`。
  5. 今日任务精简列表：未完成任务（任务名/时间/优先级色点/完成钮），滚动区；点条目回主窗详情。

### 5.3 数据流（沿用 A4，不改架构）

- 快加任务 → `TaskService`（可撤销语义与主窗一致）；专注控制 → `pomodoroStore`（读 `focus_sessions` + `settings.active_focus`）；进度/任务 → `TaskRepository`/`taskService.getTasksByDate`。
- 跨窗同步：写后 `invoke("notify_tasks_changed")` → 各窗收 `df:tasks-changed` 刷新。Mini 增补对 `df:tasks-changed`/`df:focus-changed`（若存在）的订阅以保持实时。
- 全部经既有 Core Service，不引入新数据通道。

## 6. 涉及文件（预估）

**前端**
- `src/index.css`（token 三套 + 玻璃层 + 噪点）
- `src/lib/theme.ts`（新：主题解析/应用/监听系统）
- `src/stores/settingsStore.ts` + `src/services/settingsService.ts`（`theme_mode` 键；关闭行为枚举扩展）
- `src/main.tsx`、`src/App.tsx`（主题接入、TitleBar 挂载）
- `src/components/TitleBar.tsx`（新）
- `src/components/Layout.tsx`（侧栏视觉、Mini 按钮）
- `src/components/ui/*`（Button/Dialog/Input/Select/Card/PageHeader/IconButton/ErrorState…语义化）
- 各页面与页内组件（逐批替换）
- `src/pages/MiniApp.tsx`（重设计 + 快加 + 圆环 + 专注控制）
- `src/components/CloseBehaviorDialog.tsx`、`src/components/settings/AppearanceSection.tsx`（主题三选 + 关闭行为三选 UI）
- `src/services/windowBehaviorService.ts`（转 Mini 关闭行为分发）

**Rust（src-tauri）**
- `tauri.conf.json`：主窗/Mini `decorations:false`、Mini 尺寸 360×560
- `src/lib.rs`：`toggle_mini_window`、`window_minimize/maximize_toggle` commands；窗口事件分流补「转 Mini」关闭；托盘菜单改名

**测试**
- `src/lib/theme.test.ts`（解析/三选/系统跟随逻辑）
- `src/services/settingsService.test.ts`（新键读写回退）
- `src/pages/MiniApp.test.tsx`（若可行：快加/完成渲染，沿用 A4 测试模式）
- 既有全部回归（vitest/cargo/tsc/vite build）

## 7. 验证与风险

- 每批迁移后跑 `vitest` + `tsc`；全部完成后 `cargo test` + `vite build`。
- 手工验证项（Windows 实机，dev.bat）：
  - 三主题切换即时生效与持久化；system 跟随系统深浅。
  - 玻璃主题下时间轴/密集列表可读性；backdrop-filter 性能（滚动流畅）。
  - 自绘标题栏拖拽/双击最大化/圆角/阴影；无边框窗口无异常。
  - Mini：关闭转 Mini / 标题栏按钮 / 托盘 / 快加任务 / 专注控制 / 跨窗刷新。
- 风险与缓解：
  - 无边框窗口在部分 Windows 缩放/多屏布局异常 → 保留标准标题栏回退开关（Rust 常量）。
  - 玻璃大面积 blur 性能 → 玻璃卡片 blur 控制在 20px、限制动画中 blur 层数量；密集区实体化。
  - 语义化替换量大 → 分批 + 每批回归 + 视觉抽查。

## 8. 本轮不做

- 不改业务逻辑与 DB schema；不新增数据表。
- 不做 macOS 原生毛玻璃（目标 Windows）；字体不打包；应用图标不更换（可后续单独做）。
- Mini 不做「常驻仪表盘」「全局热键唤起」（列为后续 backlog）。
