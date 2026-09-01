# Changelog

## DailyFlow 1.4.1

### Bug Fixes

- 修复 Focus 提前结束的时间统计：PAUSED 状态下直接结束/取消时，不再把「暂停后空等的时间」计入实际投入（暂停段与 resume 同口径扣除），统计只记录真实 Focus 时间
- 多次暂停/恢复不重复累计；重启恢复的进行中会话同样正确冻结

### Features

- 全局撤销/重做：Ctrl+Z 撤销、Ctrl+Shift+Z 重做（时间轴任务块移动、任务编辑、完成/取消、创建）；输入框内 Ctrl+Z 保留给文本编辑
- 任务详情：单击时间轴任务块选中并显示右侧详情（新增计划时间、创建/完成时间、Focus 投入、专注次数、关联目标；选中块有明确视觉反馈）
- 统计升级为 Productivity Overview：总投入、专注次数、完成任务、完成率、平均每次/每日投入、最常类别、每日投入趋势、每日完成任务；范围扩展为 今日/近7天/近30天/全部/自定义
- 成就扩充：500 番茄、累计 100 小时、连续 14 天、任务完成链（1/10/50/100）、单日任务（3/5）、时间轴规划/按计划完成；条件引擎新增 tasks_completed / daily_tasks_completed / planned_tasks / planned_tasks_completed
- 移除新闻（News）功能：页面/组件/服务/RSS 解析/缓存/设置/导航/快捷键/Rust 命令与依赖全部清理；迁移 0012 幂等删除旧库中的 news 表与设置键
- 窗口行为：系统托盘（图标 + 右键菜单：显示 DailyFlow / 开始暂停专注 / 退出）+ 关闭拦截；首次点击 X 询问「退出 / 隐藏到系统托盘」（可记住选择）；关闭行为可在 设置→通用 修改并立即生效；隐藏到托盘后 Focus 继续运行、完成通知照常
- 设置信息架构重组：通用（关闭窗口行为）/ 外观（时间轴显示）/ 分类 / 快捷键 / 通知 / 专注 / 数据（目录+管理）/ 关于（版本）

### Technical

- 新增迁移 0012（DROP news_items / news_sources + 清理设置键，幂等）
- 新增 UndoManager（undo/redo 栈 + diff 字段还原，Service 层捕获）；任务删除暂不接入撤销（级联 focus_sessions 恢复成本高，后续版本）
- 成就运行时收敛为 achievementRuntime 单例（专注落库与任务变更统一评估入口）
- 窗口行为收敛为 windowBehaviorService（UI → SettingsStore → Service → Tauri）；Rust 新增托盘（tray-icon feature）、close 拦截（app-close-requested 事件）、hide_to_tray / exit_app 命令；设置新增 close_behavior / close_behavior_configured 键（旧库自动默认「未配置 → 首次询问」）
- 新增测试 73 项（Focus 计时、Undo、任务详情、成就、统计总览、迁移、导航、关闭行为、托盘决策、设置持久化），共 459 项全部通过

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
