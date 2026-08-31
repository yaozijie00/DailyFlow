# 下一阶段任务体系设计（V1.4）

> 状态：已与用户确认（2026-08-31 确认方案，2026-09-01 按 Phase 1–7 分阶段实现并逐阶段验证通过）。
> 核心原则：**便签是「暂时没安排时间但不能忘记」的持久待办，长期目标是「阶段性方向」，任务通过 goal_id 关联目标并驱动进度；统计与成就合并为一个页面。**

## 1. 关键决策（已确认）

| 决策点 | 结论 |
|---|---|
| 便签形态 | 今日左栏持久便签区（独立于日期），状态 active / arranged / completed |
| 便签 → 今日任务列表 | 拖拽创建当日任务（无时间块），便签标记「已安排」 |
| 便签 → 时间轴 | 拖拽创建带时间块任务（默认 60 分钟、落点吸附），便签标记「已安排」 |
| 防重复 | 仅 active 便签可转换；转换失败不标记（状态一致） |
| 长期目标字段 | 标题 + 说明 + 截止日期（可空）+ 状态（active/completed）+ 时间戳 |
| 任务关联目标 | 任务创建/编辑弹窗「关联目标」下拉；删除目标时任务保留、goal_id 置空 |
| 目标进度 | 关联任务（不含已取消）中已完成比例，LEFT JOIN 单条 SQL 聚合 |
| 统计 + 成就 | 合并为单一「统计」页（统计 \| 成就 双 Tab），移除独立「成就」导航项 |
| 便签拖拽实现 | **鼠标方案（useWindowDrag）**，与任务行 → 时间轴一致（WebView2 下 HTML5 拖放不可靠） |

## 2. 架构总览

```
NoteList (今日左栏) ──鼠标拖拽──> noteDragSession ──> TaskList（任务列表投放区，无时间块）
                                   │                 └> Timeline（时间轴投放区，带时间块）
                                   └─ convertNoteToTask(noteId, notes, createTask, updateNote, opts)
                                          │ createTask + updateNote(arranged)
                                          ▼
                                 tasks / notes（SQLite，迁移 0009/0011）

Goals 页 ← goalStore ← GoalService ← GoalRepository（listActiveWithProgress：LEFT JOIN tasks 聚合）
TaskFormModal ── goalId 下拉 ──> tasks.goal_id（迁移 0011）
Statistics 页 ── tab: statistics|achievements ──> AchievementsView（成就视图，原成就页主体）
```

## 3. 数据模型

### 3.1 notes（迁移 0009）

```
notes
- id           PK
- title        NOT NULL
- category_id  可空，FK categories.id ON DELETE SET NULL
- status       active / arranged / completed（默认 active）
- sort_order   默认 0
- created_at / updated_at / completed_at
```

- 独立于日期持久存在；完成保留数据（不物理删除）；删除 = 物理删除。

### 3.2 goals（迁移 0010）+ tasks.goal_id（迁移 0011）

```
goals
- id           PK
- title        NOT NULL
- description  可空
- deadline     可空（YYYY-MM-DD）
- status       active / completed（默认 active）
- sort_order   默认 0
- created_at / updated_at / completed_at

tasks
- goal_id      可空，FK goals.id ON DELETE SET NULL（删除目标任务保留）
```

- 目标完成 = 标记 completed 保留历史（可折叠查看），不物理删除。

## 4. 便签转换（防重复契约）

`convertNoteToTask`（lib/noteConvert.ts，纯函数）：

1. 按 id 找到便签且 `status === "active"`，否则返回 false；
2. `createTask`（标题/分类继承；可选 scheduledDate + plannedStart/plannedEnd）；
3. 成功后 `updateNote(id, { status: "arranged" })`，返回 true；
4. 任一步抛错返回 false（便签保持 active，状态一致）。

## 5. 目标进度口径

- `totalTasks` = 关联任务中 `status != 'CANCELLED'` 的数量；
- `completedTasks` = 其中 `status == 'COMPLETED'` 的数量；
- 单条 `LEFT JOIN + GROUP BY goals.id` 聚合，按 sort_order + id 排序。

## 6. 统计 + 成就合并

- `statisticsStore` 新增 `tab: "statistics" | "achievements"` 与 `setTab`；
- `Statistics` 页顶层 Tab 栏切换：统计内容（原有） / `<AchievementsView />`（原成就页主体提取为组件）；
- 导航与 Page 类型移除 `achievements`；`Ctrl+5` → 统计 Tab，`Ctrl+6` → 成就 Tab（均落在「统计」页）。

## 7. 便签拖拽（鼠标方案）

- NoteList `onMouseDown` → `useWindowDrag`（位移 > 4px 进入拖拽，写入 `noteDragSession`）；
- 投放区判定：`noteDropZoneAt(x, y)` = `elementFromPoint` + `closest('[data-note-drop]')`；
- TaskList / Timeline 通过 `[data-note-drop]` 标记投放区并注册 `noteDropCallbacks`；
- Timeline 悬停显示琥珀色 Ghost 预览（便签名 + 时间范围，对齐 snap 粒度，默认 60 分钟）。

## 8. 页面与导航

- 今日 / 专注 / 新闻 / **长期** / **统计**（含成就 Tab）/ 设置
- 「长期」页：目标卡片网格 + 进度条、新建表单、卡片内联编辑、完成/删除、已完成折叠区

## 9. 迁移清单（本轮新增）

| 迁移 | 内容 |
|---|---|
| 0009 | notes 表 |
| 0010 | goals 表 |
| 0011 | tasks.goal_id（FK SET NULL）+ idx_tasks_goal_id |

## 10. 测试（406 项全通过）

- noteRepository 9 + NoteList 7 + convertNoteToTask 5
- goalRepository 8 + Goals 页 7
- Statistics 合并页 5 + 快捷键 1
- 既有全部回归（任务/时间轴/番茄钟/新闻/设置/备份恢复/迁移幂等）
