# 统计与成就系统设计（V1.1）

> 状态：已与用户确认关键决策。核心原则：**WorkEvent 是唯一数据源，Statistics 是聚合视图，Achievement 是条件判断，Achievement Config 是数据而非代码。**

## 1. 关键决策（已确认）

| 决策点 | 结论 |
|---|---|
| WorkEvent 数据源 | **复用 `focus_sessions` 表**（已是一番茄一行），加 `category_id` 快照列 |
| 统计口径 | 时长计**全部**（含提前结束的 actualDuration）；番茄数（event_count/streak）只计 `completed=true` |
| 成就配置引用类别 | 按**类别名称**（name 唯一） |
| 类别删除 | 历史事件保留，`category_id` 快照 JOIN 不到名称 → 归入「已删除类别」 |
| 任务删除级联 | **修复**：`task_id` 改为可空 + `ON DELETE SET NULL`，删任务不再删历史专注 |
| 页面入口 | 侧边栏加「统计」「成就」+ 快捷键 `Ctrl+5`/`Ctrl+6` |

## 2. 架构总览

```
PomodoroStore → FocusService.finish()   (focus_sessions 落库，已有)
        │
        └─（结束后追加）AchievementService.evaluate()   ← 唯一业务侵入点
              │
              ▼
   focus_sessions (= WorkEvent, 含 category_id 快照)
        ├── StatisticsService   → 今日/本周/本月/自定义/类别/日/小时聚合
        └── AchievementService  → ConditionEngine + achievement_progress
```

## 3. 数据模型

### 3.1 WorkEvent（复用 focus_sessions，迁移 0006 重建）

```
focus_sessions
- id                PK
- task_id           可空，FK tasks.id ON DELETE SET NULL（修级联删除）
- category_id       可空，快照（无 FK；专注开始时刻任务所属类别）
- planned_duration  秒（计划番茄时长）
- actual_duration   秒（实际投入，含提前结束）
- started_at / ended_at / completed / created_at
```

- 一个番茄 = 一行（开始建行、结束回填，`finalizeCurrentSession` 幂等守卫，不重复写入）。
- 「提前结束」= `completed=false` 的行（保留 actualDuration，计入时长）。
- 「取消专注」无独立写路径，天然不产生事件。

### 3.2 成就进度（迁移 0007）

```
achievement_progress
- achievement_id    text PK
- unlocked          int (0/1)
- unlocked_at       int (Unix ms，可空)
```

仅存解锁状态，进度实时聚合计算，不落库冗余统计。

## 4. 迁移

- **0006**：重建 `focus_sessions`（加 `category_id` 快照、`task_id` 可空 SET NULL），并回填已有 session 的 category_id。
  - 重建顺序：建新表 → `INSERT OR IGNORE` 复制（子查询回填 category_id）→ `DROP TABLE IF EXISTS` → `RENAME`。
  - 幂等说明：`IF NOT EXISTS`/`OR IGNORE`/`IF EXISTS` 保证可重试；唯一极小窗口是 DROP 与 RENAME 之间崩溃（微秒级），有「迁移前自动备份」兜底。
- **0007**：`CREATE TABLE IF NOT EXISTS achievement_progress`。

## 5. 统计服务（StatisticsService 扩展）

单位：**秒**（DB）、**分钟**（配置，引擎内部 ×60）。

```
getTodayStats()                      已存在，保留
getRangeStatistics(start, end)       → { totalSeconds, completedCount, eventCount }
getCategoryStatistics(start, end)    → [{ categoryId, name, seconds }]  // null→已删除类别
getDailyStatistics(start, end)       → [{ date, seconds, completedCount }]
getHourlyStatistics(start, end)      → [{ hour, seconds }]  // 按开始小时分桶
```

`lib/date.ts` 补 `startOfWeek()/startOfMonth()`。所有聚合 SQL 单查，UI 只消费结果。

## 6. 成就系统

### 6.1 配置（数据驱动）

`src/achievements/{basic,productivity,category,special}.json`，每文件一个数组，`import.meta.glob` 打包合并。

```json
{
  "id": "first_pomodoro",
  "name": "第一步",
  "description": "完成第一个番茄钟",
  "icon": "flag",
  "category": "basic",
  "condition": { "type": "event_count", "target": 1 },
  "reward": null,
  "hidden": false,
  "enabled": true
}
```

### 6.2 条件类型（目标单位：分钟 / 整数）

| type | 语义 | target |
|---|---|---|
| `event_count` | 累计走满番茄数 | 整数 |
| `total_duration` | 累计投入分钟 | 分钟 |
| `category_duration` | 某类别累计分钟（`categoryName`） | 分钟 |
| `daily_duration` | 单日投入分钟 | 分钟 |
| `streak_days` | 连续工作天数（当天≥1 个走满番茄） | 整数 |
| `category_count` | 完成过工作的不同类别数 | 整数 |

预留 `and/or/not` 递归组合（第一阶段不暴露配置，但引擎支持）。

### 6.3 ConditionEngine（纯函数，无 UI/业务耦合）

```
evaluate(condition, context) → boolean
getProgress(condition, context) → { current, target, percentage, completed }
```

Context 由 AchievementService 聚合 focus_sessions 后一次性构建：

```ts
{
  completedCount,        // 走满番茄数
  totalDurationSeconds,  // 累计实际时长
  categoryDurations,     // Map<name, seconds>
  maxDailyDurationSeconds,
  streakDays,
  distinctCategories,
}
```

### 6.4 AchievementService

- `evaluate()`：聚合 → 逐条评估 → 未解锁且达标则写 `achievement_progress`（幂等）→ 返回新解锁列表。
- `getProgressList()`：返回全部定义 + 进度 + 解锁态 + unlockedAt。
- 配置加载校验（缺 id/target、未知 type、非法 categoryName）→ 跳过 + `console.warn`，不崩溃。

### 6.5 解锁通知

`Toasts` 扩展支持标题+描述，渲染 `🏆 成就解锁 / 名称 / 描述`，自动消失。

## 7. UI

- **统计页**：范围 Tab（今日/本周/本月/自定义）+ 汇总卡（总时长 + 走满番茄数）+ 类别横向柱状图（自绘 div，tooltip）+ 今日小时折线图（自绘 SVG）。空数据 → 「今天还没有投入记录」。
- **成就页**：`已解锁 X/Y` + Tab（全部/进行中/已解锁）+ 卡片网格（未解锁显示进度 `37/50h 74%`）+ 详情弹窗。
- **导航**：`Page` 增 `statistics`/`achievements`；侧边栏加项；`Ctrl+5`/`Ctrl+6`。

## 8. 错误处理

- 类别删除：`category_id` 快照 JOIN 不到 → 「已删除类别」。
- 成就配置非法：跳过 + warn，不崩溃。
- 空数据：显示空态文案，不空白不报错。
- WorkEvent 持久化可靠：聚焦于 `focus.finish()` 已有 `.catch(persistFail)`，落库失败 toast，不静默丢。

## 9. 测试

- WorkEvent：完成→建行；取消→不建；幂等→不重复。
- 统计：今日/周/月/自定义、类别聚合、空数据、时间边界（[from,to)）。
- 成就：6 种条件各自达标/未达标边界、streak 连续/断档、配置校验、解锁幂等。

## 10. 验收

见需求文档第二十八条清单。核心：每个走满番茄有唯一 WorkEvent；统计可今日/周/月/类别聚合；成就数据驱动、6 条件、进度显示、解锁持久化+不重复+通知、非法配置不崩溃；不破坏现有功能、不引新依赖。
