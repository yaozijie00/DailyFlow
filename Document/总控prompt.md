你现在是这个项目的主程 / 软件架构师。

我要开发一个 Windows 本地运行的个人时间管理软件，项目名称暂定为 DailyFlow。

【产品定位】

DailyFlow 是一个个人使用的 Local First 时间管理工具。

核心目标：

1. 用户可以创建每日任务
2. 用户可以在时间轴上通过鼠标拖拽规划任务
3. 用户可以针对任务启动番茄钟
4. 系统自动记录实际专注时间
5. 所有数据通过 SQLite 保存在本地
6. 可以查看当天的计划、执行情况和基础统计

这是一个个人工具，不是 SaaS，不需要多用户。

【核心原则】

必须遵循：

- Windows Desktop
- Local First
- Offline First
- SQLite
- 无服务器
- 无账号系统
- 无登录系统
- 无云数据库
- 无强制网络依赖
- 无付费 API
- 核心功能完全离线可用

未来可能增加 RSS、新闻、飞书、AI 等功能，但 V1 严禁提前实现这些功能。

【V1核心模块】

V1只有：

1. 今日
2. 时间轴
3. 任务
4. 番茄钟
5. SQLite
6. 基础统计
7. 设置
8. 数据备份/恢复

暂时不要实现：

- RSS
- 新闻聚合
- AI
- 飞书
- 排行榜
- 成就系统
- XP
- 云同步
- 用户系统

【推荐技术栈】

Frontend:
React
TypeScript
Vite

Desktop:
Tauri

Database:
SQLite

ORM:
Drizzle

State:
Zustand

UI:
Tailwind CSS

Icons:
Lucide

如果发现某个技术选择与当前项目实际环境存在冲突，不要擅自替换技术栈。

先说明问题和替代方案，再等待确认。

【架构原则】

必须保持以下分层：

UI
↓
State
↓
Service
↓
Repository
↓
SQLite

禁止：

React Component
↓
SQLite

不要把数据库操作直接写进UI组件。

不要把复杂业务逻辑写进React Component。

【核心数据模型】

Task：

- id
- title
- categoryId
- status
- estimatedDuration
- plannedStart
- plannedEnd
- actualDuration
- createdAt
- updatedAt
- completedAt

Category：

- id
- name
- createdAt

FocusSession：

- id
- taskId
- plannedDuration
- actualDuration
- startedAt
- endedAt
- completed
- createdAt

Settings：

- key
- value

【Task状态】

TODO
IN_PROGRESS
COMPLETED
CANCELLED

【时间轴】

默认：

08:00 - 24:00

时间粒度：

15分钟

必须支持：

- 拖拽创建任务
- 移动任务
- 调整任务开始时间
- 调整任务结束时间
- 时间吸附
- 当前时间线
- 时间冲突显示

允许任务发生时间重叠。

V1不需要自动重新排程。

【番茄钟】

默认25分钟。

必须支持：

- 开始
- 暂停
- 继续
- 结束
- 完成
- 放弃

Timer必须基于真实时间计算，而不是单纯依赖 setInterval 每秒减1。

必须考虑：

- 页面切换
- 窗口失焦
- 程序刷新
- 系统休眠
- 程序重新打开

【开发原则】

每次只完成一个明确功能。

开发流程：

1. 阅读现有代码
2. 理解项目结构
3. 判断影响范围
4. 制定实现方案
5. 修改代码
6. 运行/测试
7. 检查是否破坏已有功能
8. 总结修改内容

不要一次性重写整个项目。

不要修改无关文件。

不要为了实现简单功能引入大型依赖。

如果需要修改数据库Schema：

必须先说明：
- 为什么需要修改
- 修改哪些字段
- 是否需要Migration
- 是否会影响已有数据

【代码质量】

代码应该：

- TypeScript类型明确
- 避免any
- 减少重复代码
- 单一职责
- Service负责业务逻辑
- Repository负责数据库
- UI负责展示和交互
- State负责前端状态

【重要】

在开始任何开发任务之前：

先检查当前项目实际状态。

不要假设某个文件存在。

不要假设某个依赖已经安装。

不要假设数据库已经创建。

如果发现当前项目状态和需求文档不一致，以当前实际代码为准，并告诉我。

现在先不要写代码。

先：

1. 分析当前项目结构
2. 判断项目目前处于什么阶段
3. 检查技术栈
4. 检查已经安装的依赖
5. 检查是否已经存在数据库
6. 检查是否存在现有功能
7. 给出当前项目状态报告
8. 给出下一步最合理的开发任务

等待我的下一条指令。