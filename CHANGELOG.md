# Changelog

## DailyFlow 1.4.0

### Features

- 便签系统：今日左栏持久便签区（独立于日期），快速添加 / 双击编辑 / hover 完成与删除 / 已安排折叠态
- 便签 → 任务：按住拖到今日任务列表创建当日任务（无时间块），拖到时间轴创建带时间块任务（默认 60 分钟、落点吸附），原便签自动标记「已安排」防重复
- 长期目标：目标卡片（标题/说明/截止日期）+ 关联任务完成进度条；新建/编辑/完成/删除；已完成折叠区
- 任务关联长期目标：任务创建/编辑弹窗新增「关联目标」下拉（删除目标时任务保留、关联置空）
- 统计页合并：统计 + 成就合并为单一「统计」页（统计 | 成就 双 Tab），移除独立「成就」导航项；Ctrl+5 / Ctrl+6 分别定位两个 Tab
- 便签拖拽改为鼠标方案（WebView2 下 HTML5 拖放不可靠，与任务行 → 时间轴一致）
- 新应用图标（来自 ICON.png 的 1024² 方形源图，重新生成全套尺寸）

### Technical

- 新增迁移 0009（notes 表）、0010（goals 表）、0011（tasks.goal_id + FK SET NULL + 索引）
- 新增 NoteRepository / NoteService / noteStore、GoalRepository（LEFT JOIN 聚合进度，不含已取消任务）/ GoalService / goalStore
- 便签转任务收敛为纯函数 `convertNoteToTask`（防重复 + 失败状态一致）
- 新增测试 21 项（便签 16 + 目标 15 + 统计合并 5 + 快捷键 1），共 406 项全部通过

## DailyFlow 1.3.0

### Features

- 时间轴可读性优化（重叠分栏、实时重排、换栏、拖拽预览）
- 全局 Focus 系统：右下角全局专注栏，任意页面可见当前番茄状态
- 专注时长与规划约束：双击任务块按规划时长自动计算番茄数
- 专注开始/结束系统通知（tauri-plugin-notification + 设置开关），后改为软件内 Toast + 系统通知并存
- 今日布局调整、滑块联动（开始按钮分钟数实时更新）、双击任务不再误入专注（状态守卫）

### Technical

- 迁移 0008（tasks.sort_order，按计划时间/创建顺序回填）
- 专注会话重命名为 WorkEvent 数据源，任务删除保留历史专注记录（task_id SET NULL）

## DailyFlow 1.2.0

### Features

- 项目审计清理：README / LICENSE / CHANGELOG、死代码、冗余资源、依赖整理

### Technical

- Cargo 依赖整理与 lockfile 更新

## DailyFlow 1.1.0

### Features

- 新闻中心：RSS 订阅 + SQLite 缓存 + 图片缓存，离线可读（源可自定义、国内网络友好默认源）
- 统计系统：今日/本周/本月/自定义范围投入时长、类别分布、今日工作轨迹
- 成就系统：数据驱动的渐进式成就（完成番茄钟解锁、进度显示、未来成就隐藏）
- 今日日历导航：点击标题切换任意日期，历史/未来日期可查看与编辑
- 今日节日/节气显示
- 快速创建任务
- 分类颜色自定义
- 时间轴交互优化：重叠分栏（甘特式）、实时重排、换栏、拖拽预览
- 任务备注字段
- 设置页分组（General / Pomodoro / Shortcuts / Categories / News / Storage / Data）
- 可自定义应用内快捷键
- 存储位置设置（数据/缓存/备份目录）
- 新应用图标

### Technical

- WorkEvent 统一数据源（focus_sessions + category_id 快照）
- 任务删除不再级联删除历史专注记录（task_id SET NULL）
- 成就条件引擎（event_count / total_duration / category_duration / daily_duration / streak_days / category_count）
- 迁移 0001-0007（sort_order / news / category color / notes / focus_sessions rework / achievement_progress）
- 新增大量单元测试（302 项）

## DailyFlow 1.0.0

### Features

- 每日任务管理
- 时间轴规划
- 番茄钟专注
- 本地 SQLite 存储
- 数据备份/恢复

### Technical

- React + Tauri + SQLite + Drizzle ORM
