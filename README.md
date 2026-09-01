# DailyFlow

本地优先的个人时间管理与专注工具。基于 Tauri 2 + React 构建，数据完全存储在本地 SQLite，无需账号、无需联网。

## 功能

- **今日**：任务清单 + 全天时间轴规划，支持拖拽排期、重叠分栏、日历切换任意日期查看/编辑；单击时间轴任务块在右侧查看详情
- **便签**：今日左栏持久便签区，按住拖到任务列表或时间轴即转为当日任务；任务也可拖回便签（双向转换，自动标记「已安排」防重复）
- **长期**：长期目标月视图（月份 Gantt：跨天任务块、拖动调整日期、手动/自动进度）；任务可关联目标
- **专注**：番茄钟（专注 → 短休息 → 长休息循环），专注记录按实际投入时间落库，支持暂停/恢复/提前结束
- **统计**：今日/近7天/近30天/全部/自定义范围的投入时长、专注次数、任务完成率、类别分布、每日趋势；成就（渐进式解锁）同页 Tab 切换
- **撤销/重做**：Ctrl+Z / Ctrl+Shift+Z 撤销任务移动、编辑、完成、创建
- **窗口行为**：系统托盘常驻；关闭窗口可选择「退出」或「隐藏到系统托盘」（首次点击 X 询问一次，可随时在设置修改）
- **设置**：通用/外观/分类/快捷键/通知/专注/数据/关于，快捷键支持点击录制与冲突检测

## 技术栈

- Tauri 2（Rust）+ React 19 + TypeScript
- Vite 7 + Tailwind CSS 4
- Drizzle ORM（sqlite-proxy）+ SQLite
- Zustand（状态管理）+ Vitest（测试）

## 开发

```bash
npm install          # 安装依赖
npm run dev          # 前端开发（Vite）
npm run tauri dev    # 桌面开发（Tauri）
```

首次 `npm run tauri dev` 需要 Rust 工具链（[rustup](https://rustup.rs)）与系统 WebView2 运行时。

## 构建

```bash
npm run build        # 前端类型检查 + 生产构建
npm run tauri build  # 生成安装包（NSIS，Windows）
```

安装包输出到 `src-tauri/target/release/bundle/`。

## 测试

```bash
npm test             # 运行全部单元/组件测试（Vitest）
```

## 项目结构

```
src/
├── components/      # UI 组件（ui/ 基础组件 + 各 feature 组件）
├── pages/           # 页面（今日/专注/长期/统计/设置）
├── stores/          # Zustand 状态
├── services/        # 业务逻辑
├── db/              # schema + migrations + repositories
├── lib/             # 纯工具函数（时间轴/日历/日期/格式化/撤销/便签转换等）
├── hooks/           # React hooks
└── achievements/    # 成就配置（JSON）+ 条件引擎
src-tauri/           # Rust 后端（Tauri 命令 + SQLite 插件）
```

## 数据存储

数据默认保存在安装目录下的 `data/`（`dailyflow.db`），备份在 `data/backups/`，图片缓存在 `data/cache/`。可在「设置 → 存储」中自定义路径。

## License

[MIT](./LICENSE)
