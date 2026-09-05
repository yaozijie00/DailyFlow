# DailyFlow 界面/视觉优化调研报告

> 技术栈：Tauri 2 + React 19 + TS + Tailwind v4 + Zustand，Windows/WebView2，三主题（浅/深/毛玻璃）语义 token 已就绪
> 调研方式：web_search 多轮；链接均来自实际检索。许可以各仓库 LICENSE 为准

---

## 〇、WebView2 兼容性先决条件
- WebView2 = 常青 Chromium：`@starting-style`/`transition-behavior: allow-discrete`（117+）、View Transitions（111+）、backdrop-filter 均可用
- ⚠ 最大雷区：**透明窗口 + CSS backdrop-filter 无法透桌面**（只能模糊自身页面层级），[wails#2340](https://github.com/wailsapp/wails/issues/2340)；真毛玻璃须用 **OS 窗口材质（Mica/Acrylic，Rust 侧）**
- ⚠ 动画优先 transform/opacity；大 blur/大阴影动画易掉帧

## 一、动效/过渡
| 方案 | 链接 | 许可 | 契合度 |
|---|---|---|---|
| **Motion（原 Framer Motion，新包 `motion`）** | [公告](https://motion.dev/blog/framer-motion-is-now-independent-introducing-motion) | MIT | **高**：任务完成动画/列表 FLIP/页面切换/进度环一站式，React19 兼容 |
| GSAP（3.13 全免费含 Flip） | [公告](https://gsap.com/blog/3-13/) | 专有免费商用 | 中：复杂 choreography 最强；React 需 useGSAP 清理（本地有 gsap-* skills） |
| react-spring | [React19 PR #2368](https://github.com/pmndrs/react-spring/pull/2368) | MIT | 中：数值驱动动画（数字/进度环）局部用 |
| AutoAnimate | [GitHub](https://github.com/formkit/auto-animate) | MIT | 高（轻量）：零配置列表 FLIP |
| Tailwind v4.1 原生进场离场 | [transition-behavior](https://tailwindcss.com/docs/transition-behavior) · [@starting-style](https://stevekinney.com/courses/tailwind/starting-style) | — | 高：零依赖淡入淡出 |
| tw-animate-css | [GitHub](https://github.com/Wombosvideo/tw-animate-css) | MIT | 高：shadcn 组件路线必装（v4 替代 tailwindcss-animate） |

## 二、组件库/设计系统
| 方案 | 链接 | 许可 | 契合度 |
|---|---|---|---|
| **shadcn/ui** | [Tailwind v4 & React19 讨论 #6714](https://github.com/shadcn-ui/ui/discussions/6714) | MIT | **高**：copy-paste、token 可保留，取组件结构 |
| Radix Primitives | [索引](https://relatedrepos.com/gh/radix-ui/primitives) | MIT | 高：只拿行为/焦点/无障碍（shadcn 底层） |
| Base UI (MUI) | [GitHub](https://github.com/mui/base-ui) | MIT | 中高 |
| Ark UI + Park UI | [ark](https://github.com/chakra-ui/ark) · [park](https://github.com/anubra266/park-ui) | MIT | 中高 |
| **React Aria Components (Adobe)** | [command palette 示例](https://github.com/adobe/react-spectrum/blob/092229c6/packages/react-aria-components/docs/examples/command-palette.mdx) | Apache-2.0 | 高：键盘优先/命令面板/无障碍 |
| Ariakit | [GitHub](https://github.com/ariakit/ariakit) | MIT | 中 |

## 三、字体/排版/质感
| 方案 | 链接 | 契合度 |
|---|---|---|
| cn-css-font-family（中文栈） | [GitHub](https://github.com/pluwen/cn-css-font-family) | 高：Windows 雅黑/Segoe 组合 |
| Fontsource（内置 Variable 字体） | [GitHub](https://github.com/fontsource/fontsource) | 高：离线零延迟；[tabular-nums 参考](https://github.com/daintreehq/daintree/pull/3827) |
| 中文 UI 字体 MiSans / HarmonyOS Sans | [rime 推荐](https://github.com/iDvel/rime-ice/issues/841) | 高：桌面中文质感最关键单项 |
| lucide（现状，ISC） | [GitHub](https://github.com/lucide-icons/lucide) | 高 |
| Tabler / Iconify 补充 | [tabler](https://github.com/tabler/tabler-icons) · [iconify](https://github.com/iconify/iconify) | 中高 |

## 四、窗口/外壳（Tauri）
| 方案 | 链接 | 契合度 |
|---|---|---|
| **window-vibrancy（OS Mica/Acrylic）** | [GitHub](https://github.com/tauri-apps/window-vibrancy) | **高**：毛玻璃透桌面的正解；注意 [tauri#12854](https://github.com/tauri-apps/tauri/issues/12854) 显隐联动 bug |
| Tauri v2 内建窗口自定义 | [中文文档](https://v2.tauri.org.cn/learn/window-customization/) | 高：data-tauri-drag-region 已用 |
| tauri-plugin-decorum | [GitHub](https://github.com/clearlysid/tauri-plugin-decorum) | 中高：自绘标题栏+阴影圆角 |
| 动态切换实战 | [52pojie 帖](https://www.52pojie.cn/thread-2052242-1-2.html) | 中 |

## 五、可抄的开源效率 App
| App | 链接 | 契合度 | 可抄点 |
|---|---|---|---|
| **Plane（Linear 风）** | [helm](https://artifacthub.io/packages/helm/makeplane/plane-ce)（AGPL） | 高：⌘K/侧栏/行内编辑乐观更新（React+Tailwind 同栈） |
| Vikunja | [GitHub](https://github.com/go-vikunja/vikunja)（AGPL） | 中：信息架构 |
| Super Productivity | [GitHub](https://github.com/super-productivity/super-productivity/releases)（MIT） | 中：今日视图+时间盒，形态最接近 |
| AppFlowy | [GitHub](https://github.com/AppFlowy-IO/AppFlowy)（AGPL） | 中：主题/命令菜单体验标准 |
| Flow Launcher | [GitHub](https://github.com/Flow-Launcher/Flow.Launcher)（MIT） | 中：悬浮结果列表/热键 |
| Things 3 clone | [GitHub](https://github.com/martypenner/tasks-app) | 中：克制排版 |

## 六、最值得采纳 Top 5（对 DailyFlow）
1. **Motion（`motion` 包）** — 任务完成/列表/页面/进度环动效一站式（只管动效不管样式，与 token 无冲突）
2. **window-vibrancy（OS Mica/Acrylic）** — 毛玻璃主题「透桌面」正解，配合已用自绘标题栏
3. **shadcn/ui 组件结构 + 自有 token（配 tw-animate-css）** — 补齐弹层/菜单等有状态组件
4. **React Aria Components 命令面板** — 键盘优先/无障碍
5. **字体质感包**：Fontsource Variable 字体 + tabular-nums + 免费商用中文 UI 字体（MiSans/HarmonyOS Sans）

**立即见效细节**：所有统计/耗时数字加 `tabular-nums`；任务完成用勾选路径动画 + 卡片位移淡出。

---
*本文件所有链接来自 web_search 实际返回结果，未臆造 URL。*
