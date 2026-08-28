# DailyFlow V1 设计文档（Design Spec）

- **日期**：2026-08-27
- **关联需求文档**：`E:\03_Project\Programming\PJ_DailyFlow\Document\开发需求文档.md`
- **状态**：已批准（用户确认，作为 V1 开发依据）

---

## 1. 概述

DailyFlow V1 是一个**个人本地 Windows 桌面工具**，解决一个具体问题：

> 我今天计划做什么？什么时候做？实际上花了多少时间？

核心闭环：**任务 + 时间轴 + 番茄钟**，V1 只实现四个模块：今日、时间轴、番茄钟、SQLite 数据系统。

### 1.1 范围（In Scope）

- 今日页（默认启动页）：左侧任务列表 + 横向时间轴 + 底部今日摘要
- 专注页：历史专注记录与基础统计
- 设置页：番茄钟、时间轴、类别、主题、备份/恢复
- SQLite 本地持久化、备份、恢复、迁移

### 1.2 非目标（Out of Scope）

- RSS / 新闻（V2）、成就 / XP / 飞书（V3）、AI 规划（V4）
- 账号系统、服务器、付费服务、任何联网核心依赖
- 多日视图（V1 仅今日，但数据结构预留扩展）

---

## 2. 关键决策记录（ADR）

| # | 决策 | 结论 |
|---|------|------|
| D1 | 技术栈 | Tauri + React + TypeScript + Vite + SQLite + Drizzle + Zustand + Tailwind CSS + Lucide |
| D2 | 数据访问 | 方案 A：Rust 侧 SQLite（`@tauri-apps/plugin-sql`）+ Drizzle `sqlite-proxy` 桥接 |
| D3 | 时间轴方向 | **横向**（时间从左到右，任务块左/右边缘调整时长，当前时间线为竖线） |
| D4 | 任务日期模型 | V1 仅今日；新增 `scheduled_date` 字段预留多日拓展 |
| D5 | 放弃专注 | 也保存记录（`completed = false` + 实际时长） |
| D6 | 主题 | 浅色 + 深色 + 跟随系统（默认 system） |
| D7 | 时间与时长存储 | 时间戳存 Unix 毫秒；时长统一存**秒**；日期存本地 `YYYY-MM-DD` |
| D8 | 专注持久化 | 专注开始时即写入 `focus_sessions` 行（`ended_at = null` 表进行中）；暂停态持久化到 `settings` |

---

## 3. 架构与分层

```
React 组件 / 页面
   ↓
Zustand Store（UI 状态 + 数据快照）
   ↓
Application Services（TaskService / FocusService / TimelineService / StatisticsService）
   ↓
Repository 层（Drizzle ORM：schema + 类型安全查询）
   ↓
sqlite-proxy 适配器（db.ts）→ @tauri-apps/plugin-sql（Rust 侧 SQLite）
```

- **前端（WebView）**：React + TS + Tailwind，负责 UI 与交互。
- **Repository**：Drizzle 定义 4 张表 schema 与查询；通过 `drizzle-orm/sqlite-proxy` 把 SQL 转发给 Tauri SQL 插件。
- **Rust 侧**：仅用 `@tauri-apps/plugin-sql` 管理 `dailyflow.db`，不写业务逻辑。
- **`db.ts` 适配器**：一次性封装 Drizzle `sqlite-proxy` → Tauri 插件命令的映射。

**数据访问纪律**（需求文档第 43 节，强制）：
组件禁止直连 SQLite，必须走 `React → Store → Service → Repository → SQLite`。

**数据位置**：`%LOCALAPPDATA%/DailyFlow/`，结构 `dailyflow.db` + `backups/` + `logs/`。

---

## 4. 数据模型（4 张表）

时长单位：**秒**。时间戳单位：**Unix 毫秒**。

### 4.1 tasks

| 列 | 类型 | 说明 |
|----|------|------|
| id | integer PK autoincrement | 主键 |
| title | text NOT NULL | 任务名称 |
| category_id | integer NULL（FK categories.id） | 类别，可空 |
| status | text NOT NULL default 'TODO' | `TODO / IN_PROGRESS / COMPLETED / CANCELLED` |
| estimated_duration | integer NULL | 预计时长（秒） |
| planned_start | integer NULL | 计划开始（Unix ms） |
| planned_end | integer NULL | 计划结束（Unix ms） |
| actual_duration | integer NOT NULL default 0 | 实际累计时长（秒） |
| scheduled_date | text NOT NULL | 所属日期（本地 `YYYY-MM-DD`），V1 恒为今天 |
| created_at | integer NOT NULL | 创建时间 |
| updated_at | integer NOT NULL | 更新时间 |
| completed_at | integer NULL | 完成时间 |

> `scheduled_date` 是对需求文档字段表的唯一结构性扩展，服务于「仅今日 + 保留多日拓展」。

### 4.2 categories

| 列 | 类型 | 说明 |
|----|------|------|
| id | integer PK autoincrement | 主键 |
| name | text NOT NULL UNIQUE | 类别名 |
| created_at | integer NOT NULL | 创建时间 |

默认类别：开发 / 设计 / 学习 / 工作 / 生活 / 其他。

### 4.3 focus_sessions

| 列 | 类型 | 说明 |
|----|------|------|
| id | integer PK autoincrement | 主键 |
| task_id | integer NOT NULL（FK tasks.id） | 关联任务 |
| planned_duration | integer NOT NULL | 计划时长（秒） |
| actual_duration | integer NOT NULL default 0 | 实际时长（秒），结束时回填 |
| started_at | integer NOT NULL | 开始时间（Unix ms） |
| ended_at | integer NULL | 结束时间；`NULL` = 进行中 |
| completed | boolean NOT NULL default false | `true`=走满全程；`false`=提前结束/放弃 |
| created_at | integer NOT NULL | 创建时间 |

进行中会话 = `ended_at IS NULL`。`completed` 语义：
- `true`：番茄钟完整走完 25 分钟。
- `false`：提前结束（保存）或放弃（也保存，记录实际投入）。

### 4.4 settings（Key-Value）

| 列 | 类型 | 说明 |
|----|------|------|
| key | text PK | 键 |
| value | text NOT NULL | 值（字符串，复杂值用 JSON） |

默认键：
- `pomodoro_duration`：`"1500"`（秒）
- `timeline_start`：`"08:00"`
- `timeline_end`：`"24:00"`
- `timeline_snap`：`"15"`（分钟）
- `theme`：`"system"`
- `active_focus`：JSON，见 5.3

---

## 5. 番茄钟计时引擎

### 5.1 计时原理

不依赖 `setInterval` 递减。核心公式：

```
elapsed = now - startedAt - accumulatedPauseMs
```

- UI 每秒刷新一次显示（`mm:ss`），但真实耗时始终按时间戳差值计算。
- 天然规避：窗口切换、UI 卡顿、系统休眠、程序刷新导致的计时漂移。

### 5.2 状态机

```
IDLE → RUNNING → PAUSED → RUNNING → ... → FINISHED
                 ↘                    ↘
                  (结束/放弃 → FINISHED)
```

- `RUNNING`：有 `startedAt`，`pausedAt = null`。
- `PAUSED`：有 `pausedAt`，暂停时长 = `now - pausedAt`，恢复时累加进 `accumulatedPauseMs`。

### 5.3 持久化与恢复

- **开始专注**：立即写 `focus_sessions` 行（`started_at` 填，`ended_at = null`），并在 `settings.active_focus` 写 `{"sessionId":<id>,"pausedAt":null,"accumulatedPauseMs":0}`。
- **暂停 / 继续**：更新 `settings.active_focus` 的 `pausedAt` / `accumulatedPauseMs`。
- **结束 / 放弃**：回填该行 `ended_at`、`completed`、`actual_duration`；累加 `tasks.actual_duration`；清空 `settings.active_focus`。
- **启动恢复**：查 `focus_sessions WHERE ended_at IS NULL` → 存在则按时间戳重建计时器，继续显示（休眠期间如实累计）。

### 5.4 结束流程

- **走满 25 分钟**：弹「专注完成」→ [完成任务] / [继续专注]。
- **提前结束**：弹确认，显示已专注时长 → [继续] / [结束并保存] / [放弃]。
- **放弃**：保存 `completed = false` + 实际时长（D5）。

---

## 6. 时间轴

### 6.1 布局与刻度

- 横向时间轴，`08:00`（左）→ `24:00`（右），可横向滚动。
- 整点刻度 + 每 15 分钟小刻度；比例暂定 **1 小时 = 120px**（16 小时 ≈ 1920px）。
- 范围 `timeline_start` / `timeline_end` 由设置决定。

### 6.2 拖拽创建

空白处按下 → 横向拖动 → 实时显示选中范围 → 松开 → **最近 15 分钟吸附** → 弹「创建任务」窗口 → 确认 → 创建 Task → 显示任务块。

吸附算法（最近 15 分钟）：
```
snap(ms) = round(ms / 15min) * 15min
```

### 6.3 任务块操作

- **移动**：拖动任务主体，整体平移（保持时长）。
- **调整开始**：拖左边缘。
- **调整结束**：拖右边缘。
- 所有调整均做 15 分钟吸附。

### 6.4 重叠与当前时间线

- 允许任务重叠：视觉高亮重叠区、可提醒、不阻止、不自动重排。
- 当前时间线：竖线，每分钟刷新；进入今日页自动横向滚动到当前时间附近。

### 6.5 双向同步

时间轴任务块 ↔ 左侧任务列表 ↔ 任务详情，改动任意一处经 Store 统一刷新。

---

## 7. 页面结构

### 7.1 今日（默认页）

三区布局：
- **左侧**：今日任务列表（勾选完成、当前任务高亮、新建任务）。「当前任务」= 正在专注的任务（存在进行中 focus_session）；无进行中专注时 = 最近一个 IN_PROGRESS 任务。
- **中间**：横向时间轴。
- **底部**：今日摘要（今日专注时长、完成数 / 总数、完成率、[开始专注]）。

### 7.2 专注页

今日总专注时长、专注次数、今日专注记录列表（时间 / 任务 / 时长）。V1 不做复杂图表。

### 7.3 设置页

番茄钟时长（5/15/25/45/60/自定义）、时间轴范围与吸附、类别管理、主题、数据备份 / 恢复。

### 7.4 任务详情

点击任务 → 右侧详情面板：类别、计划时间、预计、实际、状态、[开始专注] / [完成任务] / [删除]。

---

## 8. 错误处理 / 备份恢复 / 迁移

- **数据库错误**：Service 层捕获并转用户可读提示（toast），写操作失败保持原状态，不崩溃。
- **备份**：直接复制 `dailyflow.db` → `backups/DailyFlow_Backup_YYYY-MM-DD.db`。
- **恢复**：选文件 → 校验（能打开、schema 合法）→ 自动备份当前库 → 确认覆盖 → 替换 → 重启应用。
- **迁移**：drizzle-kit 管理，严格「先备份 → 迁移 → 校验」，禁止直接覆盖旧库。

---

## 9. 测试策略

- **单元测试（Vitest）**：计时数学、15 分钟吸附、统计聚合（专注求和、完成率）。
- **服务层测试**：TaskService / FocusService / StatisticsService，用内存 SQLite 或 mock Repository。
- **组件/交互测试**：时间轴拖拽、任务增删改（Testing Library）。
- **手动验收**：需求文档 Phase 7 稳定性测试 + 第 56 节验收清单。

---

## 10. 目录结构

沿用需求文档第 44 节，补充 `db/` 与 `lib/`：

```
dailyflow/
├── src/
│   ├── components/（TaskList / Timeline / TaskDetail / Pomodoro / Statistics）
│   ├── pages/（Today / Focus / Settings）
│   ├── services/（taskService / focusService / timelineService / statisticsService）
│   ├── stores/（taskStore / focusStore）
│   ├── db/（schema.ts / db.ts 适配器 / migrations/）
│   ├── lib/（timer.ts / snap.ts / stats.ts 纯函数）
│   ├── types/（task / focus / category）
│   └── App.tsx
├── src-tauri/
├── database/
├── tests/
└── README.md
```

---

## 11. 开发阶段（映射需求文档 Phase 1–8）

1. **Phase 1 项目基础**：初始化 Tauri + React + TS + Vite，配置 SQLite 插件，建 schema，基础 Layout 与路由。
2. **Phase 2 任务系统**：类型、Repository、Service、创建/编辑/删除/完成、列表与详情 UI。
3. **Phase 3 时间轴**：基础 UI、刻度、当前时间线、任务块、拖拽创建、吸附、移动/调整、重叠显示、双向同步。
4. **Phase 4 番茄钟**：计时引擎、FocusSession、FocusService、开始/暂停/继续/结束/完成/放弃、实际时长累计、专注页。
5. **Phase 5 今日 Dashboard**：统计、完成率、当前任务、快速开始专注。
6. **Phase 6 设置**：番茄钟、时间轴、类别、主题、备份/恢复。
7. **Phase 7 稳定性**：Timer 异常、数据库异常、重启、休眠、恢复、拖拽、数据一致性测试。
8. **Phase 8 打包**：Windows Build、Installer、首次启动、数据目录/数据库初始化、卸载/升级测试。

---

## 12. 验收标准与优先级

**最高优先级**（需求文档第 69 节）：
1. 数据可靠 → 2. 时间轴交互流畅 → 3. 番茄钟准确 → 4. 任务操作简单 → 5. 页面清晰 → 6. 数据可备份 → 7. 性能稳定 → 8. 视觉美化。

**V1 成功标准**：用户每天能在 30 秒内完成第一次计划并开始第一次专注；一天结束能回答「今天计划了什么 / 实际做了什么 / 时间花在哪」。

完整验收清单以需求文档第 56 节为准，逐条核对。
