# DailyFlow

本地优先的个人时间管理与专注工具。基于 Tauri 2 + React 构建，数据完全存储在本地 SQLite，无需账号、无需联网。

## 功能

- **今日**：任务清单 + 全天时间轴规划（拖拽排期、重叠分栏、时间冲突与日程超载提示、昨日未完成结转、任务延期 明天/周末/下周）；单击时间轴块在右侧详情查看
- **任务体系**：分类、重复任务（每天/工作日/每周/每月）、任务拆分（子任务折叠与进度）、可撤销的 Postpone、项目归属（Goal → Project → Task）
- **便签**：持久收集箱，双向拖拽转换（便签 ↔ 今日任务）；「已安排」折叠/还原/一键清理（可撤销）
- **快速捕获**：Ctrl+Shift+I 自然语言创建（`明天 14:00 1.5h #开发 写文档`）；Ctrl+K 跨类型搜索（任务/目标/便签）并跳转
- **长期**：整月真实月历网格（周一为首、跨周任务自动拆段、Lane 防重叠、+N 折叠、点格/圈选新建、拖动与边缘 Resize）；目标进度（自动/手动）、已完成可恢复/删除
- **专注**：手动时长番茄钟，专注按真实投入落库（预计与实际分离）；关窗后台继续 + 系统通知 + 托盘常驻；今日专注历史
- **统计**：今日/本周/近7天/近30天/全部/自定义的投入、完成率、类别与小时分布、每日趋势、预计 vs 实际
- **复盘**：叙述性复盘（计划偏差/低估率/最佳时段/项目投入 Top/停滞目标告警），连续周复盘解锁成就
- **成就**：分类/进度/隐藏彩蛋/实时解锁 Toast（含周复盘连续成就）
- **撤销/重做**：任务/便签/目标/项目创建、编辑、删除、拖动、转换等全操作可撤销；删除后 Toast 一键撤销
- **窗口行为**：系统托盘常驻（含打开 今日/长期/统计）；关闭行为可配置（退出 / 隐藏到托盘）
- **设置**：通用/外观/分类/快捷键/通知/专注/数据/关于；备份与恢复、快捷键录制与冲突检测

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
