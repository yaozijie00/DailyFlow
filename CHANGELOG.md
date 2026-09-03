# Changelog

## DailyFlow 2.1.0

### Features（2.0.x 产品优化：A Focus 双层参数 / B 设置·快捷键 / C 课程表 / D 成就 2.0 / 布局梳理）

- A · Focus 双层参数：专注页开始前的时长/休息调整只作用于「本次」，不再回写全局默认；「恢复默认」一键还原；默认番茄目标改为 1 个（进入即可开始）
- A · 本次循环计划随会话落库（迁移 0018：focus_sessions 新增 planned_break_minutes / planned_break_count / planned_pomodoro_count），统计可比对「计划 vs 实际」
- B · 设置页标签重组：原「专注」页签并入新增「默认」Tab（默认执行参数：决定「我通常怎么专注」）；快捷键默认位调整：长期 Ctrl+3（新增动作）、统计 Ctrl+4、成就 Ctrl+5、设置 Ctrl+,
- C · 课程表（迁移 0017 courses + weekly_slots、0019 tasks.course_id）：
  - 长期页新增「课程表」：周一～周日周视图（08:00–22:00）+ 课程库；课程关联分类取色/标签；点格子添加 60 分钟安排
  - 课程块可拖拽改星期与开始时间（15 分钟吸附），hover 调整时长 ±30 分/删除；课程与时段增删改全部接入 Undo
  - 今日页「今日课程」：查看「今天」时按课程表列出应上课，一键「加入今日」生成带计划时间的课程任务（可撤销，删除课程时任务归属置空）
  - 周进度汇总：每门课「本周已完成 / 应出时段」（getWeekProgress，周一～周日口径）
- D · 成就 2.0：
  - 新条件类型：task_streak_days（连续执行天数，允许 1 天空窗）、night_sessions（23:00 后完成的专注）、estimate_streak（连续「预计误差 ≤15%」的完成）、course_tasks_completed（累计完成课程任务）、undo_daily（当日撤销次数）
  - 新增成就链：连续执行 3/7/14 天、课程链（第一堂课 / 累计 10 节）及夜间专注 / 计划准确 / 撤回大师等探索成就；成就定义按分类拆分 JSON，成就页新增分类页签（专注/任务/连续/复盘/课程/探索…）
- 浅色布局梳理：导航选中态改为浅底 + 左侧指示条；统一 PageHeader / EmptyState 层级与间距；今日页左栏加宽（w-72）与统一间距；统计 / 设置页放宽一档（max-w 4xl / 3xl）

### Technical

- 迁移 0017 / 0018 / 0019（幂等；既有库自动补齐列）；Schema 同步 courses / weekly_slots / planned_* / course_id
- lib/schedule.ts（周视图坐标换算）+ lib/courseToday.ts（当日应上课推导，含单测）；courseRepository / courseService / courseStore
- achievementService：computeTaskStreak（宽限 1 天）/ computeEstimateStreak（含单测）；undoManager 每日撤销计数（todayUndoCount，跨日自动归零）
- 测试 605/605 全绿；版本 2.1.0

## DailyFlow 2.0.0

### Features（v2.0 Complete：闭环收口）

- 复盘驱动成就：首次复盘 / 连续 2 / 4 / 8 周复盘成就链（打开「复盘」Tab 即登记本周复盘，settings 记录 streak；解锁走既有成就 Toast）
- 成就引擎新增 `weekly_reviews` 条件与 `weeks` 进度单位（formatProgress / 卡片「还差 N 周」适配）
- README 功能清单整体同步 v1.7～v2.0

### Technical

- lib/reviewStreak.ts（周序号 + streak 推导，含单测）；review.json 成就链
- 测试 590/590 全绿；版本 2.0.0

## DailyFlow 1.9.0

### Features（v1.9 Intelligence Through Data：从数据到结论）

- 统计页新增「复盘」Tab（今日 / 本周 / 近30天）：
  - 叙述性复盘（确定性文本）：总投入与专注次数、任务完成与完成率、计划 vs 实际偏差、时间低估率与平均超时、最佳投入时段、投入最多项目
  - 类别投入 Top / 项目投入 Top（横向条图）
  - 「近两周无推进目标」告警（进行中且近 14 天无关联任务完成）
  - 空数据引导与口径说明
- 数据查询层：会话按任务所属项目 SQL 聚合（projectAggregateInRange）；停滞目标查询（listActiveStalled，仅含已挂任务的目标）
- 服务：statisticsService.getProjectStatistics / goalService.listStalled

### Technical

- lib/reviewNarrative.ts 纯函数叙述生成（含单测）；StatsTab 新增 review
- 测试 587/587 全绿

## DailyFlow 1.8.0

### Features（v1.8 Product Structure：Goal → Project → Task）

- 新增「项目」二级：目标下可创建/重命名/删除项目（迁移 0015：projects 表 + tasks.project_id）
- 任务归属项目：任务表单「项目」下拉按目标过滤，选项目自动联动所属目标；任务详情显示「项目」
- 长期页「目标项目」管理区：每个进行中目标下列出其项目并可添加/删除（删除保留任务、可撤销）
- 项目创建/重命名/删除全部接入 Undo（删除还原含任务关联）
- 任务拆分（Task Split，迁移 0016：tasks.parent_id）：
  - 任务详情「子任务」区：添加子任务（继承父任务日期/分类/目标/项目）、勾选完成/恢复、删除、进度条 x/y
  - 任务列表分组展示：全部视图下子任务折叠在父任务下（不单独成行），父行显示「子任务 x/y」进度
- 目标进度口径不变（仍按 tasks.goal_id 聚合）；删除父任务时子任务保留并置空

### Technical

- ProjectRepository/ProjectService/useProjectStore；ProjectWithGoal（含所属目标标题左连）
- 拆分撤销：创建子任务即入撤销栈（撤销删除子任务不影响父任务）
- 迁移 0015 / 0016；测试 583/583 全绿（项目管理与拆分分组用例）

## DailyFlow 1.7.0

### Features（v1.7 Core Stability）

- 统计 SQL 级聚合：Focus 汇总/每日/小时/类别改为 SUM/GROUP BY 下沉数据库（不再把会话全量拉到 JS），万级会话（6000+ 规模测试）结果与逐条口径一致，为长期数据增长打底
- 任务 Postpone 延期：详情面板新增 明天/周末/下周 快捷延期 + 自定义日期（改 scheduledDate，可撤销）
- 时间冲突检测：今日 TODO 任务计划区间重叠 → ⚠ 提示（列出冲突对）
- 日程超载提醒：今日计划总时长超建议容量（默认 8h）→ 提示并按时长列出「移到明天」快捷
- History 快捷导航：日历 Popover 顶部新增 昨天/今天/明天/本周/上周/本月 一键跳转
- Ctrl+K 命令面板扩展为跨类型搜索：任务 + 长期目标 + 便签（目标跳长期页、便签跳今日页）
- Ctrl+N 快速新建（默认快捷键由 Ctrl+Shift+T 改为 Ctrl+N，仍可在设置修改）

### Features（此前未发版并入，原 1.6.2 批次）

- 长期页 7 列真实月历网格：整月一屏无横滚、真实日期 28/29/30/31/闰年/跨年、跨周任务自动拆段、行内 Lane 防重叠、溢出 +N 更多、点空白格/圈选新建、拖动移动与边缘 Resize（日级 snap）
- 长期目标全操作纳入 Undo（创建/编辑/完成/删除+恢复任务关联）；撤销后自动刷新 Store 并 Toast 动作名；撤销按钮显示可撤销动作名
- 专注页今日专注历史（时间/任务/时长，点击看详情）
- 统计「预计 vs 实际」对比模块 + 自然周「本周」口径；成就过滤语义修正 + 顶部解锁总览
- 昨日未完成结转横幅（逐项/全部，批量可撤销）；任务/便签/长期任务删除 Toast 内嵌「撤销」
- Ctrl+K 命令面板与全库任务搜索跳转；Ctrl+Shift+I 快速捕获（自然语言解析日期/时间/时长/分类创建）
- 重复任务 V1（repeat_rule：每天/工作日/每周/每月，完成自动生成下一实例，与完成合并为一次撤销；迁移 0014）
- 便签「已安排」折叠区：还原为未安排 / 全部清理（可撤销）
- 已完成长期任务可恢复为进行中 / 删除（误完成修正）；托盘新增 打开今日/长期/统计

### Bug Fixes

- 撤销/重做 id 漂移：创建任务「重做」改按原 id 还原（insertRestored），修复 撤销→重做→再撤销 残留重复任务块、撤销栈提前耗尽的问题

### Technical

- 迁移 0014：tasks.repeat_rule；undoManager.lastLabel（成功动作描述）；Toast 支持内嵌操作按钮（删除撤销等）
- 统计聚合 Repository：summaryInRange / dailyAggregateInRange / hourlyAggregateInRange / categoryAggregateInRange
- 新增规模正确性测试（6000 会话对照独立口径）；测试 565+ 项全绿

## DailyFlow 1.6.1

### Bug Fixes

- 时间轴任务块选择灵敏度：mousedown 后 <4px 的轻微手抖不再被误判为拖动，纯点击可靠切换右侧 Detail Panel（此前无位移阈值，轻微位移即吞掉 click 导致详情不更新；切页后 Timeline 重挂载才恢复）

### Technical

- 版本统一 1.6.1

## DailyFlow 1.6.0

### Bug Fixes

- Detail Panel 选择同步：拖动任务块后的尾随 click 不再吞掉下一次选择（仅同块拖拽抑制），点击任意块右侧立即切换对应任务
- Focus Timer 简化：取消「根据任务预计时间/番茄目标自动限制或推算专注时长」（删除约束弹窗与双击自动规划），用户自选时长，系统只按真实 Session 累计实际投入
- Timeline 块跳动：编辑任务只改内容（标题/备注/分类/预计）时不再重排 sort_order，块位置保持不变；仅改时间才重排
- 长期月视图时间粒度：从「7 列周视图」改为「月度连续日时间轴」（当月每天一列 + 星期标注，今天高亮、周末浅底、横向滚动、日级 snap、跨月裁剪）

### Features

- 完整 Undo/Redo：删除任务（含专注历史恢复）、便签创建/编辑/完成/删除全部接入；Note↔Task 转换为单次复合操作（一次 Ctrl+Z 整体还原）；历史上限可设（20/50/100/200，默认 50，内存历史不跨重启）
- Undo/Redo UI：侧边栏按钮（无历史禁用、Undo 后 Redo 启用）+ Ctrl+Y 重做别名 + 失败时栈一致并 Toast 提示
- 统计「每日任务」按 scheduledDate 分组列表

### Technical

- UndoManager：maxHistory / subscribe / withBatchAsync（批量动作合并）/ 失败回滚栈
- Repository 新增 insertRestored（任务/会话/便签原 id 重建，供删除撤销）
- 月视图重构：monthView 提供 daysInMonth/monthDays/daySpanInMonth（动态天数 + 跨月裁剪），任务块定位基于日偏移×日宽
- 测试 505 项全部通过；版本 1.6.0

## DailyFlow 1.5.0

### Bug Fixes

- 悬浮窗「结束」观感修复：会话完成（COMPLETED）后悬浮条隐藏，不再停留「专注中 00:00」造成「没反应」
- 悬浮窗点击跳转修复：点击主体 / 「去专注」跳转「专注」页（此前错误跳今日），暂停/结束按钮不误跳转
- 统计「每日任务」数据源：新增按 scheduledDate 分组的每日任务列表（此前仅完成趋势图、无任务列表）

### Features

- 长期规划月视图：长期页升级为月级 Gantt（月份导航 / 周一为首日历 / 跨天任务块 / 拖动整体平移 / 拖边缘调整起止 / 点击编辑）；数据复用 goals 表（迁移 0013：start_date / priority / manual_progress）
- 长期任务进度：手动进度优先，否则按关联任务完成率自动计算；编辑弹窗显示 进度 / 关联任务 / 专注投入
- 便签 ↔ 任务双向拖拽：任务列表行与时间轴块新增「转便签」手柄，拖到便签区转为便签（保留专注历史、不产生重复对象）
- 悬浮窗可拖动避让（左侧手柄，默认右下角）
- 成就彩蛋：新增 category_named（类别名含关键词）与 tasks_created 条件 + 6 个隐藏成就（？？？ → 解锁显示）

### Technical

- 新增迁移 0013（goals 扩展，幂等；旧库自动升级）
- 新增 monthView 纯函数（月份网格/跨度/平移）、useTaskToNoteDrag、convertTaskToNote（含失败回滚）
- 新增测试 30 项，共 489 项全部通过

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
