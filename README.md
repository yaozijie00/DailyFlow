# DailyFlow

本地优先的个人时间管理与专注工具。基于 Tauri 2 + React 构建，数据完全存储在本地 SQLite，无需账号、无需联网。

## 功能

- **今日**：任务清单 + 全天时间轴规划，支持拖拽排期、重叠分栏、日历切换任意日期查看/编辑
- **专注**：番茄钟（专注 → 短休息 → 长休息循环），专注记录自动落库
- **统计**：今日/本周/本月/自定义范围的投入时长、类别分布、今日工作轨迹
- **成就**：数据驱动的渐进式成就系统（完成番茄钟自动解锁，未来成就隐藏）
- **新闻**：RSS 订阅 + 本地缓存，离线可读
- **设置**：快捷键、分类管理（颜色/排序）、存储位置、番茄钟参数

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
├── pages/           # 页面（今日/专注/新闻/统计/成就/设置）
├── stores/          # Zustand 状态
├── services/        # 业务逻辑
├── db/              # schema + migrations + repositories
├── lib/             # 纯工具函数（时间轴/日历/日期/格式化等）
├── hooks/           # React hooks
└── achievements/    # 成就配置（JSON）+ 条件引擎
src-tauri/           # Rust 后端（Tauri 命令 + SQLite 插件）
```

## 数据存储

数据默认保存在安装目录下的 `data/`（`dailyflow.db`），备份在 `data/backups/`，图片缓存在 `data/cache/`。可在「设置 → 存储」中自定义路径。

## License

[MIT](./LICENSE)
