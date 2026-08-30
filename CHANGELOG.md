# Changelog

## DailyFlow 1.1.0

### Features

- 新闻中心：RSS 订阅 + SQLite 缓存 + 图片缓存，离线可读（源可自定义、中国网络友好默认源）
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
