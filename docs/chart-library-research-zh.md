# DailyFlow「统计页」数据可视化选型调研

> 技术栈：Tauri 2 + React 19 + TypeScript + Tailwind CSS v4 + Zustand（桌面端，深色/毛玻璃 UI）
> 现状：统计页为自绘 SVG 图表（柱状 / 折线 / 环形）
> 调研方式：web_search 多轮检索，以下链接均为实际检索结果

---

## 〇、结论速览

| 决策点 | 建议 |
|---|---|
| 换库 or 补强自绘 | **分而治之**：通用趋势图（折线/柱状，含 tooltip、动画、缩放）换用 shadcn/ui Charts（底层 Recharts v3，React 19 官方支持）；环形分类与日历热力等"小而定制"的图保留/升级自绘 SVG |
| 首选库 | Recharts v3（经 shadcn 封装），唯一与 Tailwind v4 / CSS 变量主题天然配合的 React 19 主力库 |
| 深色主题 | 颜色一律走 Tailwind v4 `@theme inline` + CSS 变量（`var(--color-chart-1)`），再喂给图表层 |
| 不推荐 | Plotly（体积灾难）、Victory / visx（维护停滞风险）、Tremor（已转投 Vercel、风格强约束） |

---

## 一、React 图表库对比

### 1. Recharts（v3）
- 链接：[GitHub](https://github.com/recharts/recharts) · [v3.0.0 发布说明](https://github.com/recharts/recharts/discussions/5984) · [发行历史](https://github.com/recharts/recharts/releases)
- 一句话：声明式、基于 SVG 的 React 图表库，React 生态默认选择，shadcn/ui Charts 的底层。
- 许可：MIT
- 契合度：**高**
- 理由：
  - React 19：v3 起官方兼容（peerDeps 放开），社区大量 Next.js 15 / React 19 应用；注意个别版本出现过运行时问题，如 [issue #6578（v3.1.1 circular selector import）](https://github.com/recharts/recharts/issues/6578)、[2.x 的 #5500](https://github.com/recharts/recharts/issues/5500)，锁稳定版本即可。
  - Tailwind v4 / 深色：SVG 元素可直接填 `var(--color-xxx)`，天然跟随 CSS 变量换肤——这正是 shadcn 主题方案的前提。
  - 体积：单包 + d3 子依赖，中等（约 100–200 KB gzip 量级），比 ECharts/Plotly 小得多。
  - 交互：内置 Tooltip / Legend / 动画 / Brush 缩放，无需自研。

### 2. Visx（Airbnb）
- 链接：[GitHub](https://github.com/airbnb/visx) · [维护方向讨论 #1908](https://github.com/airbnb/visx/discussions/1908) · [社区对比页](https://npm-compare.com/@ant-design/charts,@nivo/bar,@visx/shape,recharts)
- 一句话：Airbnb 出品的低层 D3+React 图元库，把 d3-scale/d3-shape 封装成 React 组件，一切自己拼。
- 许可：MIT
- 契合度：**中**
- 理由：灵活性与自绘路线一脉相承，可精细控制视觉；但 Airbnb 已宣布不再主动维护（见讨论 #1908），属社区维护状态。若你们愿意用 d3-scale 思路补强自绘，可只借鉴其思想而非引入依赖；作为整体方案则维护风险偏高。

### 3. Chart.js + react-chartjs-2
- 链接：[react-chartjs-2 GitHub](https://github.com/reactchartjs/react-chartjs-2) · [v4 迁移文档](https://react-chartjs-2.js.org/docs/migration-to-v4/) · [React 19 支持现状分析（社区文章）](https://blog.gitcode.com/6ed940cd5cea0e4e3e9a55585fadd944.html) · [版本与安全页](https://security.snyk.io/package/npm/react-chartjs-2/versions)
- 一句话：最流行的 Canvas 图表库的 React 封装，动画与 tooltip 开箱即用。
- 许可：MIT
- 契合度：**中**
- 理由：
  - 渲染走 Canvas，样式不是 DOM/CSS——深色主题无法靠 `var()` 直接换色，需在 scriptable 选项里读 `getComputedStyle`，对 Tailwind v4 token 适配要多一层胶水。
  - React 19：wrapper v5 已跟进（社区有多篇兼容性分析），但 wrapper 层在 React 生态里始终是"二等公民"，事件/动画不与 React 状态流整合。
  - 体积：可按需注册 Chart.js 模块裁剪（社区教程见 [Stack Overflow](https://stackoverflow.com/feeds/question/75333297)），仍比自绘大。
  - 结论：够用但不"React 原生"，适合已有 Chart.js 经验、要 canvas 性能的场景。

### 4. Apache ECharts + echarts-for-react
- 链接：[ECharts 官方按需 import 指南](https://apache.github.io/echarts-handbook/en/basics/import/) · [echarts-for-react 文档（DeepWiki）](https://deepwiki.com/hustcc/echarts-for-react/2-installation) · [封装库百科](https://baike.baidu.com/item/echarts-for-react/67871550)
- 一句话：能力最强的全能图表引擎（热力/日历/时间线/3D/大数据流全都有），React 侧用轻封装。
- 许可：Apache-2.0（ECharts）/ MIT（echarts-for-react）
- 契合度：**中（低，取决于需求）**
- 理由：
  - 按 `echarts/core` + 按需注册（见官方 import 文档）可大幅裁剪，但即使如此仍是本组最大的库（常见数百 KB 级），对 Tauri 桌面冷启动与打包体积不友好。
  - React 19：echarts-for-react 更新节奏慢，wrapper 以命令式 option 驱动，React 心智弱；TS 类型与 v4 配置项复杂度高。
  - 深色主题：支持 CSS 变量字符串，但 option 体系要求 JS 端组装主题，与 Tailwind token 联动需要自己写桥接。
  - 建议：只有当未来要上「日历热力 + 复杂缩放 + 大数据量」时再考虑引入，作为少数页面按需加载（动态 import）。

### 5. Tremor
- 链接：[Vercel 收购 Tremor 公告](https://vercel.com/blog/vercel-acquires-tremor) · [挪威媒体解读（开源化）](https://www.kode24.no/artikkel/vercel-kjoper-og-opensourcer-tremor-framtida-til-dashbord-er-apen-kildekode/226050) · [竞品对比页](https://www.metricui.com/docs/compare/tremor)
- 一句话：Tailwind 官方同门出身的仪表盘组件库，图表基于 Recharts 再封装。
- 许可：MIT（Vercel 收购后开源，见上方公告）
- 契合度：**中**
- 理由：风格与 Tailwind 契合、上手快；但它是"完整组件体系"，自带设计语言与约 束（会限制 DailyFlow 毛玻璃自定义风格），且图表能力与 shadcn Charts 同源（都是 Recharts）。既然你们已用 Tailwind v4 + 自绘风格，直接取 shadcn 级封装更可控。

### 6. shadcn/ui Charts（基于 Recharts）
- 链接：[shadcn 定制化指南（官方技能文档）](https://github.com/shadcn-ui/ui/blob/3f14ffa6/skills/shadcn/customization.md) · [shadcn 主题指南（第三方镜像）](https://github.com/fusengine/agents/blob/main/plugins/shadcn-expert/skills/shadcn-theming/references/theming-guide.md) · [React 生态知识库：生产环境图表选型笔记](https://github.com/Nguyen-Mau-Anh/react-kb/blob/main/10.production/03-charts-and-viz.md)
- 一句话：把 Recharts 的最佳实践（CSS 变量色板、渐变、tooltip 样式、ResponsiveContainer）收敛成可复制代码块，深度拥抱 Tailwind。
- 许可：MIT
- 契合度：**高（首选）**
- 理由：Chart 组件默认用 `--chart-1..5` 之类 CSS 变量作为 `stroke/fill`，与 Tailwind v4 `@theme inline` 变量体系一一对应，深色切换 0 成本；代码是"放进你项目里的源码"，可自由改造成毛玻璃/圆角风格；React 19 由底层 Recharts v3 保证。代价是引入 Recharts + 代码量。

### 7. Victory
- 链接：[npm 对比（chart.js vs react-vis vs recharts vs victory-chart）](https://npm-compare.com/chart.js,react-vis,recharts,victory-chart) · [victory-chart CHANGELOG](https://cdn.jsdelivr.net/npm/victory-chart@37.3.6/CHANGELOG.md)
- 一句话：老牌 SVG 声明式图表库，React 原生，曾与 Recharts 齐名。
- 许可：MIT
- 契合度：**低**
- 理由：发布频率与社区活跃度长期偏低（对比页与 CHANGELOG 可见更新节奏），React 19 适配滞后风险高；没有 CSS 变量换肤的设计（样式在主题对象里配置）。仅当项目已重度依赖 Victory 才考虑保留。

### 8. Nivo
- 链接：[React 19 支持 issue #2618](https://github.com/plouc/nivo/issues/2618) · [React 19 支持 issue #2678](https://github.com/plouc/nivo/issues/2678) · [v0.90.0 解析（社区）](https://blog.gitcode.com/a16c3b5556d598d7d21b5eb9960ed067.html) · [React 19 环境下的实际 lockfile 佐证](https://github.com/ARGA-Genomes/arga-frontend/blob/main/pnpm-lock.yaml)
- 一句话：基于 D3 的声明式图表全家桶，风格统一、动画精致。
- 许可：MIT
- 契合度：**中**
- 理由：React 19 支持经由 issue #2618/#2678 跟踪，0.88+ 已可跑在 React 19（有真实项目 lockfile 佐证），但官方确认节奏偏慢；依赖 D3 子包较多、难以 tree-shake，体积比 Recharts 大；换肤靠自带 theme 对象（支持字符串颜色，CSS 变量可传入 SVG），不如 shadcn/Recharts 的 token 方案顺滑。适合"要非常精致的开箱动画"，否则 Recharts 更省心。

### 9. Plotly（react-plotly.js）
- 链接：[按 bundle 裁剪官方/社区指南（DeepWiki）](https://deepwiki.com/plotly/react-plotly.js/4.3-bundle-options) · [社区：如何减小 plotly.js 体积](https://community.plotly.com/t/how-can-i-reduce-bundle-size-of-plotly-js-in-react-app/89910)
- 一句话：面向科研/金融的超级全能图表，但体积巨大。
- 许可：MIT
- 契合度：**低**
- 理由：即便用 partial bundle 仍达数百 KB 至 MB 级（社区通篇在讨论如何减负）；风格偏"科研风"，与毛玻璃/极简桌面 UI 违和；React 19 适配依赖 wrapper 更新。与 DailyFlow 场景完全不对口。

### 10. ApexCharts
- 链接：[官方《2026 JS 图表现状》博客](https://apexcharts.com/blog/state-of-javascript-charting-2026/) · [LogRocket 2026 最佳 React 图表库盘点](https://blog.logrocket.com/best-react-chart-libraries-2026/)
- 一句话：功能齐全的 SVG 图表库，自带丰富的交互与主题。
- 许可：MIT
- 契合度：**中**
- 理由：图表能力强、文档好，但体积中等偏大；主题体系为 JS 对象 + 预设主题，与 Tailwind v4 token 联动需自己桥接；React 封装（react-apexcharts）为命令式 option 风格。可作为 ECharts 的"轻替代"，但不如 Recharts+CSS 变量优雅。

> 补充总览参考：[LogRocket《Best React chart libraries in 2026》](https://blog.logrocket.com/best-react-chart-libraries-2026/)（性能/功能/用例视角）、[react-kb 生产环境图表选型](https://github.com/Nguyen-Mau-Anh/react-kb/blob/main/10.production/03-charts-and-viz.md)（综合知识笔记）。

---

## 二、轻量 SVG/Canvas 方案（自绘 vs 无依赖迷你库）

### 1. 自绘 SVG（现状路线，补强版）
- 链接（思路参考）：[CSS Grid 仿 GitHub 热力图（中文教程）](https://m.php.cn/faq/2215143.html) · [GitHub 风格日历热力 HTML/CSS/JS 片段](https://fwdtools.com/ui-snippets/github-contribution-heatmap/)
- 一句话：用 `<rect>/<path>/<circle>` + CSS 变量 + SMIL/CSS transition 手写柱/线/环/热力。
- 许可：不适用（自己代码）
- 契合度：**高（对"小而定制"的图）**
- 理由：0 依赖、体积 0、与 Tailwind v4 token 零隔阂（SVG 属性吃 CSS 变量）、毛玻璃/圆角/渐变完全可控，最贴合 Tauri 桌面"几类固定图表"的小体量；代价是 tooltip、坐标轴刻度、动画细节要自己实现，量一多维护成本上升。**建议自绘负责 ≤2 类固定形态（环形分布、日历热力网格），趋势/对比类交给库。**

### 2. uPlot（极速时间序列迷你库）
- 链接：[GitHub](https://github.com/leeoniya/uPlot) · [真实迁移案例：Recharts+Nivo → uPlot 省 550KB](https://github.com/bdougie/contributor.info/issues/359) · [React 封装 @kondi/uplot](https://www.npmjs.com/package/@kondi/uplot)
- 一句话：面向时间序列/折线/面积/柱的极速迷你引擎（约 35–45 KB min、gzip 十几 KB 级），Canvas 级性能。
- 许可：MIT
- 契合度：**中（高，若专注时长是长区间大样本时间序列）**
- 理由：体积/性能全场最强，社区有"替换 Recharts+Nivo 立省 550KB"的实证；但**没有环形/饼图**、不声明式、样式靠 CSS 类名+回调（对 Tailwind 变量友好），React 集成需薄封装。适合未来「每日趋势」拉长到全年、或要做实时专注流时按需引入。

### 3. react-chartjs-2 精简版（Chart.js 按需注册）
- 链接：[Stack Overflow：用特定 chart 类型减小体积](https://stackoverflow.com/feeds/question/75333297) · [react-chartjs-2 GitHub](https://github.com/reactchartjs/react-chartjs-2)
- 一句话：只注册所需 chart 类型/插件后的 Chart.js，可作"轻量 canvas 方案"。
- 许可：MIT
- 契合度：**低–中**
- 理由：比 ECharts 轻、动画好，但仍比自绘重，且深色主题需脚本化读 CSS 变量；既然统计图静态、样本量小，canvas 的高性能优势用不上。

### 4. react-calendar-heatmap / uiwjs react-heat-map（GitHub 风格热力）
- 链接：[felixmosh/react-calendar-heatmap](https://github.com/felixmosh/react-calendar-heatmap) · [uiwjs/react-heat-map](https://github.com/uiwjs/react-heat-map)
- 一句话：SVG 版 GitHub contribution 日历热力组件，专注「时间×强度」分布。
- 许可：MIT
- 契合度：**中**（可借鉴代码，慎重整包引入）
- 理由：形态与「专注时间分布/每日趋势热力」高度匹配；但前者更新停滞多年、后者依赖自建组件风格，直接引入容易与毛玻璃 UI 打架。**推荐参考其结构后自绘**（纯 CSS Grid 即能复刻，见本组第 1 条）。

---

## 三、统计图表视觉设计参考

### 1. Linear Dashboards 官方文档与设计规范
- 链接：[Dashboards 功能文档](https://linear.app/docs/dashboards) · [构建 Linear Dashboard 的最佳实践](https://linear.app/now/dashboards-best-practices)
- 一句话：业界"数据密度克制、微交互精致"的标杆，可直接当统计页布局/配色的参照系。
- 价值：强调单指标大数字 + 迷你趋势 + 明细表的分层信息架构，适合 DailyFlow「周复盘」页。

### 2. GitHub contribution 图（热力/时间线）
- 链接：[GitHub-Style Contribution Heatmap（HTML/CSS/JS 片段）](https://fwdtools.com/ui-snippets/github-contribution-heatmap/) · [Activity Heatmap 片段](https://fwdtools.com/ui-snippets/activity-heatmap/) · [CSS Grid 复刻教程](https://m.php.cn/faq/2215143.html)
- 一句话：一周七列 × 数年横排的小方块矩阵，色阶表达强度，是「专注时间分布」的天然模型。
- 价值：周/月维度的专注热力可直接照搬该视觉语言（色阶 → 专注分钟数），且实现上只需 CSS Grid/轻量 SVG。

### 3. TickTick 统计/洞察类开源分析项目
- 链接：[haciSeydaoglu/ticktick-insights（导出 CSV → 洞察，隐私优先）](https://github.com/haciSeydaoglu/ticktick-insights) · [TickTick 效率技巧（含统计视角）](https://www.whizsky.com/10-easy-tips-to-boost-productivity-with-ticktick/)
- 一句话：围绕 TickTick 数据的第三方洞察项目，可借鉴"任务完成趋势/分类占比"的指标拆解思路。
- 价值：确认任务类统计的通用指标集（完成数/按时率/分类占比/连续打卡），用于对齐 DailyFlow 周复盘维度（官方 UI 无可直接引用的截图资料，故以第三方项目为参照）。

### 4. 时间线 / 日历热力参考实现集合
- 链接：[ecosyste.ms calendar-heat 话题聚合](https://repos.ecosyste.ms/topics/calendar-hea) · [@histonemax/react-heat-map](https://www.npmjs.com/package/@histonemax/react-heat-map)
- 一句话：日历热力相关开源实现的聚合入口，方便扫一遍别人怎么做月份网格。
- 价值：挑选与 Tailwind 变量兼容的最小实现做改造基底。

### 5. 图表面板综合参考
- 链接：[MetricUI（Dashboard 组件对比/展示）](https://www.metricui.com/docs/compare/tremor) · [ApexCharts《2026 JS 图表现状》](https://apexcharts.com/blog/state-of-javascript-charting-2026/)
- 一句话：看当下主流产品的图表交互范式与各家定位。
- 价值：用于校验"哪类交互（tooltip/缩放/动画）是刚需、哪些可砍"。

---

## 四、与 Tailwind v4 深色主题集成的做法

### 1. Tailwind v4 官方主题最佳实践
- 链接：[Theming best practices in v4（官方 Discussion #18471）](https://github.com/tailwindlabs/tailwindcss/discussions/18471)
- 一句话：v4 用 `@theme` 定义 token，深色切换推荐"CSS 变量 + `dark` variant"组合。
- 做法要点：
  1. 在 `@theme inline` 里把语义色注册为变量（如 `--color-chart-1: var(--chart-1)`）；
  2. `:root` 与 `.dark`（或 `@media (prefers-color-scheme: dark)`）分别定义 `--chart-*` 实际值；
  3. 组件类如 `text-chart-1 / bg-chart-1` 与原始 `var(--chart-1)` 双通道可用。

### 2. shadcn 主题化方案（Recharts 直通 CSS 变量）
- 链接：[shadcn 定制化与主题官方技能文档](https://github.com/shadcn-ui/ui/blob/3f14ffa6/skills/shadcn/customization.md) · [shadcn 主题指南镜像](https://github.com/fusengine/agents/blob/main/plugins/shadcn-expert/skills/shadcn-theming/references/theming-guide.md)
- 一句话：shadcn 的图表正是"Recharts 的 `stroke/fill` 直接写 `var(--chart-N)`"这一模式的样板。
- 做法要点：色板 token（`--chart-1..5`）随明暗切换；图表无需 rerender 即可随 CSS 变量换肤（浏览器对 SVG 表现属性里的 `var()` 实时解析）。

### 3. Tailwind 颜色方案教学
- 链接：[Tailwind Color Schemes（Steve Kinney 课程）](https://stevekinney.com/courses/tailwind/tailwind-color-schemes)
- 一句话：系统讲解 v4 变量化配色的心智模型。
- 价值：帮助把"图表色"归并为应用级 token 而非各组件私有常量。

### 落地方案（对 DailyFlow）
1. 新增一组语义 token：`--chart-primary / --chart-accent / --chart-good / --chart-warn / --chart-grid / --chart-tooltip-bg`，在 `:root` 与 `.dark` 下给不同值；
2. 明暗切换只改 `html` 上的 class/属性，SVG（自绘与 Recharts）颜色全部引用 `var(--chart-*)` → 自动换肤、无需重挂载；
3. 玻璃拟态 tooltip：自定义 React 组件 + `backdrop-blur`，跟随指针定位（Recharts 的 `content` 插槽或自绘 portal）；
4. Canvas 方案（若引入 ECharts/Chart.js/uPlot）：写一个小 hook，在主题切换时用 `getComputedStyle` 读出 token 的解析值并 `setOption/update`，作为唯一桥接点。

---

## 五、对「现有自绘 SVG 图表」的具体建议：换库还是补强

**结论：不要整体推倒重来，也不要整体换库；按图表类型二分。**

| 图表 | 现状 | 建议 |
|---|---|---|
| 专注时长趋势（折线/面积） | 自绘折线 | → 换 Recharts（shadcn Chart 封装），获得 tooltip/渐变面积/入场动画/缩放（Brush） |
| 任务完成趋势（柱/折线、周/月切换） | 自绘柱状 | → 换 Recharts，配自定义 `content` tooltip 与毛玻璃样式 |
| 分类分布（环形/甜甜圈） | 自绘环形 | → **保留并升级自绘**：加 `<defs>` 渐变 + CSS 变量 + 点击扇区联动筛选；换库收益低 |
| 每日趋势（日粒度） | 自绘 | 折线/柱随上面两条迁移；若加"周热度色带/迷你日历"则自绘 CSS Grid 热力 |
| 周复盘 | 组合小图 | 用上面迁移后的库组件拼装 + 大数字指标行（Linear 风格） |

**执行次序建议（增量、可回滚）：**
1. 先做第 4 节 token 化（纯 CSS/类名改动，零风险），验证明暗切换下图表色正确；
2. 挑「专注时长趋势」一张图引入 Recharts v3 + shadcn Chart 代码块做试点，跑通 `var(--chart-*)` 换肤与毛玻璃 tooltip；
3. 试点满意后迁移柱状/趋势类；环形与热力保持自绘，但统一抽 `ChartTooltip` / `ChartLegend` 等共用件，避免两套 tooltip 风格；
4. 只有当未来数据量（>10⁴ 点）或需要日历热力+大数据缩放时，再评估 uPlot / ECharts 按需加载。

---

## 六、「最值得采纳前 5」推荐

1. **shadcn/ui Charts（Recharts v3）** —— 通用折线/柱状/面积图的首选落地层。React 19 官方支持、MIT、可复制进项目自由魔改、色板即 Tailwind v4 CSS 变量，深色/毛玻璃零摩擦。（参考 [shadcn 定制化文档](https://github.com/shadcn-ui/ui/blob/3f14ffa6/skills/shadcn/customization.md)、[Recharts](https://github.com/recharts/recharts)）
2. **Recharts v3 本身** —— 若不想引入 shadcn 的组件约定，直接以 Recharts 为底层 + 自有封装同样成立；注意锁稳定版规避 [#6578](https://github.com/recharts/recharts/issues/6578) 之类边角 bug。
3. **自绘 SVG 增强（环形分布 + CSS Grid 日历热力）** —— 保留并升级现有路线：CSS 变量着色、渐变 `<defs>`、portal tooltip、`prefers-reduced-motion` 感知动画；设计语言参考 [GitHub 贡献图](https://fwdtools.com/ui-snippets/github-contribution-heatmap/) 与 [Linear 最佳实践](https://linear.app/now/dashboards-best-practices)。
4. **Tailwind v4 主题 token 方案** —— 所有图表色收敛为 `--chart-*` 语义 token（[官方 theming 讨论](https://github.com/tailwindlabs/tailwindcss/discussions/18471) + [shadcn 主题指南](https://github.com/fusengine/agents/blob/main/plugins/shadcn-expert/skills/shadcn-theming/references/theming-guide.md)），这是让"库图"与"自绘图"视觉统一的先决条件，成本最低、收益最大。
5. **uPlot（远期按需）** —— 当「每日趋势/专注时间序列」样本量变大或追求极致体积性能时按需引入（[GitHub](https://github.com/leeoniya/uPlot)、省 550KB 实证见 [contributor.info #359](https://github.com/bdougie/contributor.info/issues/359)）；无环形能力，故只作补充不做主线。

**明确不选**：Plotly（体积）、Victory / visx（维护风险）、Tremor 全家桶（风格强约束且与 shadcn 底层重叠）、Nivo（React 19 跟进慢 + 体积）、ECharts（除非出现日历热力/重交互需求）。

---
*本文件所有链接来自 web_search 实际返回结果，未臆造 URL。*
