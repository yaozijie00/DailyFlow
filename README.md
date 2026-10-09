# DailyFlow 3.4

本地优先的个人时间管理与专注工具。基于 Tauri 2 + React 构建，数据完全存储在本地 SQLite，无需账号、无需联网。

## 功能

- **今日**：任务清单 + 全天时间轴规划（拖拽排期、重叠分栏、时间冲突与日程超载提示、昨日未完成结转、任务延期 明天/周末/下周）；单击时间轴块在右侧详情查看
- **任务体系**：分类、重复任务（每天/工作日/每周/每月）、任务拆分（子任务折叠与进度）、可撤销的 Postpone、项目归属（Goal → Project → Task）
- **收集箱与笔记**：待处理想法与长期保存的信息分开；可转换为任务、计划、项目或想法，保留来源并支持撤销；搜索直接定位笔记
- **快速捕获**：Ctrl+Shift+I 自然语言创建（`明天 14:00 1.5h #开发 写文档`）；Ctrl+K 跨类型搜索（任务/目标/便签）并跳转
- **长期**：计划与项目工作台、阶段与任务甘特图、4/12 周视图、独立多日范围和里程碑；拖动预览后确认日期，联动统一任务详情；保留本周承诺、容量、实际投入与复盘
- **任务详情**：统一查看与直接编辑，可展开宽面板；说明与子任务、安排与归属分区展示，草稿保留与版本冲突保护
- **专注**：关联任务与无任务计时并列；目标进度圆环、本次意图、随手收集、暂停/继续、结束反馈、任务切换、异常恢复、历史修正和补录；与 Mini 共享原生计时
- **统计**：今日/本周/近7天/近30天/全部/自定义的投入、完成率、类别与小时分布、每日趋势、预计 vs 实际
- **复盘**：叙述性复盘（计划偏差/低估率/最佳时段/项目投入 Top/停滞目标告警），连续周复盘解锁成就
- **成就**：分类/进度/隐藏彩蛋/实时解锁 Toast（含周复盘连续成就）
- **撤销/重做**：任务/便签/目标/项目创建、编辑、删除、拖动、转换等全操作可撤销；删除后 Toast 一键撤销
- **窗口行为**：系统托盘常驻（含打开 今日/长期/统计）；关闭行为可配置（退出 / 隐藏到托盘）
- **外观与设置**：经典、纸感、森林、石墨四套风格，亮暗与密度分别控制，并同步 Mini；保留毛玻璃、备份恢复、快捷键和通知设置
- **扩展平台**：保留能力声明、错误隔离、独立设置入口、扩展隔离存储与版本迁移；3.3 不再内置课程表或 Workflow

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

安装包输出到 `src-tauri/target/release/bundle/`。Windows 安装包包含 WebView2 离线安装器，使用时无需账号或网络。

## 测试

```bash
npm test             # 运行全部单元/组件测试（Vitest）
npm run tauri:e2e    # 启动测试专用桌面配置
npm run qa:tauri:e2e # 连接真实 WebView2 执行关键流程回归
cargo test --offline --lib --manifest-path src-tauri/Cargo.toml # 原生计时、恢复与备份测试
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

Windows 下数据默认保存在 `%LOCALAPPDATA%\DailyFlow\`（主库为 `dailyflow.db`），备份位于其 `backups/`，图片缓存位于 `cache/`。可在“设置 → 存储”中自定义路径。

升级前自动备份待迁移的数据库。已退役扩展的历史表与课程库继续保留在兼容与备份链路中，不因移除功能而删除。首次检测到未结束专注会要求确认离开时间，不会静默计入长时间离开。

## 扩展开发

扩展入口位于 `src/extensions/builtin/<id>/index.ts`，由宿主按清单和能力声明加载。新扩展随应用构建加入；当前未提供运行时安装任意脚本的功能。

## License

[MIT](./LICENSE)
