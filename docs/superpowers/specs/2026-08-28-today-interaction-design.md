# DailyFlow V1.1 — Today 交互优化设计（重叠分栏 / 分类颜色 / 快速创建与删除撤销）

日期：2026-08-28
状态：已与用户确认（三阶段方案 1：A → B → C）

## 背景与目标

今日页（Today）是 DailyFlow 最核心页面。本次优化目标：

1. **重叠任务块横向分栏**：时间轴上相互重叠的任务块自动向右并排排列（甘特式），替代现在的「琥珀高亮 + 重叠徽标」。
2. **分类颜色**：不同任务分类用不同颜色区分，且用户可在 Settings 中自定义（预设调色板 + 自由选择器）。
3. **快速创建**：今日页内联快速输入行，输入标题 + Enter 立即创建。
4. **删除撤销**：删除任务立即生效并弹「撤销」Toast，可一键恢复任务及其专注记录。

遵循《DailyFlow AI Coding 开发协议》：最小修改、复用现有组件/Store/Service、不改无关功能、每阶段独立测试。

## 阶段 A：Timeline 重叠分栏

### 算法（纯函数，可测试）

1. **连通分组**：以任务为节点、时间重叠（`start < other.end && other.start < end`）为边，用并查集找出所有连通组。
2. **组内贪心分栏**：每组按开始时间排序，逐任务放入「最小编号且组内末尾时间不冲突」的栏位（区间图着色，栏数最优）。
3. **布局**：每个任务 `width = 100 / 栏数 %`，`left = (栏号 - 1) × 100 / 栏数 %`；不在任何组的任务保持全宽（`left-1 right-1` 现状不变）。

### 实时重排

- 拖拽/缩放预览（`blockPreview`）时，把「正在操作的任务」的预览区间一并纳入分栏计算，其他任务块实时让位/归位（所见即所得）。
- 松手落定后按最终位置重算。

### 渲染与交互

- 现有 `findOverlappingIds` 的琥珀高亮与「重叠」徽标被分栏取代（重叠 = 并排，不再是错误状态）。
- 拖出时间轴移除、拖入创建、时间吸附、ESC 取消等交互全部保留。
- 任一分栏组任务数 > 6 时，时间轴顶部显示轻提示「该时段重叠过多」。

### 改动文件（预估）

- `src/lib/timeline.ts`：新增 `computeLanes(spans: TimeSpan[]): Map<number, { lane: number; laneCount: number }>`
- `src/components/timeline/Timeline.tsx`：渲染块时应用 `left/width` 分栏（含拖拽预览路径）
- `src/lib/timeline.test.ts`：新增分栏用例（两两重叠、传递重叠 A-B-C、独立组、非重叠全宽、拖拽预览）

### 不改

数据模型、拖拽/缩放/吸附逻辑、数据库、其他页面。

## 阶段 B：分类颜色

### Schema Gap 报告（协议 #9）

- **需要**：`categories` 表新增 `color` 列（`TEXT`，存 hex，如 `#3b82f6`）。分类颜色需持久化在分类上，用户自定义后重启保留。
- **最小 Migration `0004_categories_color.sql`**：
  - `ALTER TABLE categories ADD color text;`
  - 回填：按 `sort_order` 从预设调色板取色写入现有分类。
- **影响**：仅新增一列 + 回填默认色；不改其他表、不影响现有任务与数据。

### 调色板与默认

- 预设约 12 色（蓝 / 绿 / 紫 / 橙 / 红 / 青 / 粉 / 黄 / 靛 / 玫红 / 棕 / 灰绿等）。
- 现有分类（开发 / 设计 / 学习 / 工作 / 生活 / 其他）按 `sort_order` 顺序自动取默认色。
- 「无分类」任务用中性灰 `#9ca3af`。

### Settings → 分类 UI

- 每个分类行加**色块按钮**，点击弹出预设调色板 + 自由颜色选择器（原生 `<input type="color">`，零依赖）。
- 修改立即保存（分类 Service / Store 更新 `color`），时间轴与列表即时生效（从 taskStore.categories 读取映射）。

### 应用范围（已确认：时间轴块 + 列表色点）

- **时间轴任务块**：按 `task.categoryId` 取色 → 块底色为分类色（约 15% 透明度）+ **左侧 3px 实色条**，保证文字可读、与重叠分栏视觉不冲突。
- **任务列表**：每项加小色点（分类文字前）。
- 「无分类」→ 中性灰。

### 改动文件（预估）

- `src/db/migrations/0004_categories_color.sql`
- `src/db/schema.ts`（`categories.color`）
- `src/db/repositories/categoryRepository.ts`（update 支持 color；seed 回填）
- `src/services/categoryService.ts`、`src/stores/taskStore.ts`（`changeCategoryColor`）
- `src/components/settings/CategoriesSection.tsx`（选色 UI）
- `src/components/timeline/Timeline.tsx`、`src/components/tasks/TaskList.tsx`（着色）
- 相关测试（categoryRepository / taskStore 颜色）

## 阶段 C：快速创建 + 删除撤销

### 快速创建

- 今日页左栏「今日任务」标题下加**快速输入区**：标题输入框（Enter 立即创建）+ 分类下拉 + 预计时长输入（均可留空）+ 新增按钮。
- 创建后列表即时更新（走现有 `taskStore.createTask` → load）。
- 现有弹窗（TaskFormModal）保留，用于详细创建/编辑。
- 与 Ctrl+N（已有）配合，创建路径缩为「输入 → 回车」。

### 删除撤销

- 删除前先抓取任务及其全部专注记录（新增 `FocusSessionRepository.findByTaskId`）。
- 删除后弹「已删除 + 撤销」Toast（存活约 8 秒，带操作按钮）。
- 点撤销：按**原 id** 恢复任务及其专注记录（新增 `TaskRepository.restore` / `FocusSessionRepository.restore` 原样插回）。
- 单次撤销；撤销窗口过期或再次删除其他任务后失效（不做撤销栈）。
- 需扩展 Toast：`appStore.pushToast` 支持可选 `actionLabel / onAction / durationMs`，`Toasts` 组件渲染操作按钮并支持自定义时长。

### 改动文件（预估）

- `src/pages/Today.tsx`（快速输入区，或新增 `QuickAddTask` 小组件）
- `src/stores/taskStore.ts`（deleteTask 捕获 + undo 动作）
- `src/stores/appStore.ts`、`src/components/Toasts.tsx`（Toast 操作按钮 / 自定义时长）
- `src/db/repositories/taskRepository.ts`（restore）、`focusSessionRepository.ts`（findByTaskId / restore）
- 相关测试（taskStore 删除撤销、Toast 操作按钮）

## 测试策略

- 每阶段独立执行：`npm test` → `npm run build` → 人工验证 →（按协议）git commit。
- 阶段 A：分栏算法单测（重叠/传递重叠/独立组/全宽/预览）；人工验证拖拽实时让位。
- 阶段 B：颜色持久化/回填单测；人工验证时间轴块与列表色点、Settings 选色即时生效。
- 阶段 C：删除撤销恢复（任务 + 专注记录）单测；人工验证快速创建与撤销 Toast。
- 不执行 Tauri 生产构建（非 Tauri 核心改动；阶段 B 的 migration 属前端 SQL 文件，测试库覆盖）。

## 非目标（本设计明确不做）

- 任意网页智能抓取 / AI 摘要 / 服务器 / 云同步 / 付费 API。
- 撤销栈（仅单次撤销）、任务归档、批量操作。
- 移动端 / 触控适配。
