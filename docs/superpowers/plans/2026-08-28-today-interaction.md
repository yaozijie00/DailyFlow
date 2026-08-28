# Today 交互优化（重叠分栏 / 分类颜色 / 快速创建与删除撤销）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让今日页时间轴上的重叠任务块自动横向分栏排列、任务分类可自定义颜色，并提供快速创建与「删除可撤销」，提升创建/消除任务与多任务排布的效率。

**Architecture:** 三个阶段。A：在 `src/lib/timeline.ts` 增加纯函数 `computeLanes`（连通分组 + 贪心分栏），Timeline 渲染与拖拽预览都基于它实时重排。B：给 `categories` 表加 `color` 列（migration 0004），Settings 分类页提供预设调色板 + 自由选择器，时间轴块与任务列表按分类着色。C：扩展 Toast 支持操作按钮/时长，删除任务时先捕获任务+专注记录、弹「撤销」Toast 可按原 id 恢复；今日页任务列表顶部加内联快速输入行。

**Tech Stack:** React 19 / TypeScript / Tailwind / Zustand / Drizzle ORM（sqlite-proxy）/ Vitest / Tauri 2。

**前提说明：** 执行者先运行 `npm test` 确认基线 233 个用例全绿；本计划所有「Run」命令在项目根目录执行，测试环境为 vitest（`npm test` 可直接跑全部）。

---

## 阶段 A：Timeline 重叠分栏

### Task A1: `computeLanes` 纯函数

**Files:**
- Modify: `src/lib/timeline.ts`（追加在文件末尾）
- Test: `src/lib/timeline.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/lib/timeline.test.ts` 末尾追加（确认文件顶部已有 `import { ... } from "./timeline"`，把 `computeLanes` 加进该 import；本计划假设 import 行会更新，若编辑器报未定义即为预期失败）：

```ts
describe("computeLanes（重叠分栏）", () => {
  const M = 60_000;
  function sp(id: number, s: number, e: number): TimeSpan {
    return { id, startMs: s * M, endMs: e * M };
  }

  it("两个重叠任务各占一栏", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 70)]);
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
  });

  it("传递重叠 A-B-C 用 2 栏（A、C 同栏）", () => {
    const lanes = computeLanes([
      sp(1, 0, 60),
      sp(2, 30, 90),
      sp(3, 60, 120),
    ]);
    expect(lanes.get(1)).toEqual({ lane: 1, laneCount: 2 });
    expect(lanes.get(2)).toEqual({ lane: 2, laneCount: 2 });
    expect(lanes.get(3)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("三个同时重叠用 3 栏", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 10, 50), sp(3, 20, 40)]);
    expect(lanes.get(1)?.laneCount).toBe(3);
    expect(lanes.get(2)?.laneCount).toBe(3);
    expect(lanes.get(3)?.laneCount).toBe(3);
  });

  it("独立重叠组互不影响", () => {
    const lanes = computeLanes([
      sp(1, 0, 60), sp(2, 10, 50),
      sp(3, 120, 180), sp(4, 130, 170), sp(5, 140, 160),
    ]);
    expect(lanes.get(1)?.laneCount).toBe(2);
    expect(lanes.get(3)?.laneCount).toBe(3);
    expect(lanes.get(4)?.laneCount).toBe(3);
  });

  it("无重叠任务不在 Map 中（渲染时全宽）", () => {
    const lanes = computeLanes([sp(1, 0, 60), sp(2, 120, 180)]);
    expect(lanes.has(1)).toBe(false);
    expect(lanes.has(2)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: FAIL（`computeLanes is not defined`）

- [ ] **Step 3: 实现 `computeLanes`**

在 `src/lib/timeline.ts` 末尾（`findOverlappingIds` 之后）追加：

```ts
export interface LaneLayout {
  /** 1-based 栏号 */
  lane: number;
  /** 所在重叠组的栏数（1 = 全宽） */
  laneCount: number;
}

/**
 * 重叠任务分栏（甘特式）：
 * - 以「时间重叠为边」找连通组（并查集）；
 * - 组内按开始时间贪心分配栏位（区间图着色，栏数最优）；
 * - 无重叠的任务不在返回的 Map 中（渲染时保持全宽）。
 */
export function computeLanes(spans: TimeSpan[]): Map<number, LaneLayout> {
  const n = spans.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.startMs < b.endMs && b.startMs < a.endMs) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }
  const result = new Map<number, LaneLayout>();
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue; // 单任务组 → 全宽
    const sorted = [...idxs].sort((x, y) => spans[x].startMs - spans[y].startMs);
    const laneEnd: number[] = [];
    const assigned: { idx: number; lane: number }[] = [];
    for (const idx of sorted) {
      let lane = 0;
      while (lane < laneEnd.length && laneEnd[lane] > spans[idx].startMs) lane++;
      if (lane >= laneEnd.length) laneEnd.push(spans[idx].endMs);
      else laneEnd[lane] = spans[idx].endMs;
      assigned.push({ idx, lane: lane + 1 });
    }
    const laneCount = assigned.reduce((m, a) => Math.max(m, a.lane), 0);
    for (const { idx, lane } of assigned) {
      result.set(spans[idx].id, { lane, laneCount });
    }
  }
  return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: PASS（timeline 全部用例，含新增 5 个）

- [ ] **Step 5: 全量测试 + 提交**

Run: `npm test`
Expected: 全部通过
```bash
git add src/lib/timeline.ts src/lib/timeline.test.ts
git commit -m "feat(timeline): 重叠任务分栏算法 computeLanes"
```

### Task A2: Timeline 渲染应用分栏（含实时重排与 >6 提示）

**Files:**
- Modify: `src/components/timeline/Timeline.tsx`
- Test: 无新增组件测试（复用 A1 的算法测试；交互由人工验证）

- [ ] **Step 1: 更新 import 与移除重叠徽标逻辑**

`src/components/timeline/Timeline.tsx`：
1. 从 `../../lib/timeline` 的 import 中：移除 `findOverlappingIds`，加入 `computeLanes`；加入 `type TimeSpan`。
2. 删除 `const overlappingIds = useMemo(() => findOverlappingIds(...), [scheduledTasks]);` 整块。
3. 新增分栏计算（放在 `scheduledTasks` 定义之后）：

```tsx
  // 分栏：以「预览位置」参与计算，拖拽/缩放/拖入悬停时实时重排
  const laneSpans = useMemo(() => {
    const spans: TimeSpan[] = scheduledTasks.map((t) => {
      const isPreviewing = blockPreview?.taskId === t.id;
      return {
        id: t.id,
        startMs: isPreviewing ? blockPreview!.startMs : t.plannedStart!,
        endMs: isPreviewing ? blockPreview!.endMs : t.plannedEnd!,
      };
    });
    if (dropPreview && !scheduledTasks.some((t) => t.id === dropPreview.taskId)) {
      spans.push({ id: dropPreview.taskId, startMs: dropPreview.startMs, endMs: dropPreview.endMs });
    }
    return computeLanes(spans);
  }, [scheduledTasks, blockPreview, dropPreview]);

  const maxLaneCount = useMemo(
    () => Array.from(laneSpans.values()).reduce((m, l) => Math.max(m, l.laneCount), 0),
    [laneSpans],
  );
```

- [ ] **Step 2: 任务块渲染应用分栏**

在任务块 `map` 内、`const { top, height } = clamped;` 之后新增：

```tsx
          const layout = laneSpans.get(task.id);
          const laneStyle =
            layout && layout.laneCount > 1
              ? {
                  left: `calc(${(layout.lane - 1) * (100 / layout.laneCount)}% + 2px)`,
                  width: `calc(${100 / layout.laneCount}% - 4px)`,
                }
              : undefined;
```

把块的外层 `<div>` 改为（注意 className 去掉 `left-1 right-1` 与 overlap 分支，移除 `{overlaps && !isRemoving && <span>重叠</span>}`）：

```tsx
            <div
              key={task.id}
              onMouseDown={(e) => startMove(e, task)}
              className={`absolute cursor-grab overflow-hidden rounded text-xs active:cursor-grabbing ${
                isRemoving
                  ? "bg-red-200 text-red-900 ring-2 ring-red-500"
                  : "bg-blue-200 text-blue-900 hover:bg-blue-300"
              } ${laneStyle ? "" : "left-1 right-1"}`}
              style={{ top, height, ...laneStyle }}
            >
```

- [ ] **Step 3: 拖入悬停 Ghost 应用分栏**

`dropPreview` 的渲染 div 的 `style` 改为（`ghostLaneStyle` 定义放在 `dropPreview && (` 之前）：

```tsx
        {dropPreview &&
          (() => {
            const gl = laneSpans.get(dropPreview.taskId);
            const ghostLaneStyle =
              gl && gl.laneCount > 1
                ? {
                    left: `calc(${(gl.lane - 1) * (100 / gl.laneCount)}% + 2px)`,
                    width: `calc(${100 / gl.laneCount}% - 4px)`,
                  }
                : undefined;
            return (
              <div
                className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-blue-400 bg-blue-500/20"
                style={{
                  top: timeToY(dropPreview.startMs, config),
                  height: Math.max(
                    timeToY(dropPreview.endMs, config) - timeToY(dropPreview.startMs, config),
                    MIN_BLOCK_HEIGHT,
                  ),
                  ...(ghostLaneStyle ?? { left: "0.25rem", right: "0.25rem" }),
                }}
              >
                <span className="absolute left-0 -translate-y-full whitespace-nowrap bg-blue-500 px-1 text-[10px] text-white">
                  {tasks.find((t) => t.id === dropPreview.taskId)?.title} ·{" "}
                  {formatTimeRange(dropPreview.startMs, dropPreview.endMs)}
                </span>
              </div>
            );
          })()}
```

- [ ] **Step 4: >6 重叠轻提示**

在任务区（`taskAreaRef` div）内、`showNowLine` 之前追加：

```tsx
        {maxLaneCount > 6 && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-30 -translate-x-1/2 rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
            该时段重叠过多
          </div>
        )}
```

- [ ] **Step 5: 测试 + 构建 + 提交**

Run: `npm test`
Expected: 全部通过（timeline 用例覆盖算法）
Run: `npm run build`
Expected: 通过
```bash
git add src/components/timeline/Timeline.tsx
git commit -m "feat(timeline): 重叠任务横向分栏渲染与实时重排"
```

---

## 阶段 B：分类颜色

### Task B1: 迁移 0004 + schema + 调色板常量

**Files:**
- Create: `src/db/migrations/0004_categories_color.sql`
- Create: `src/lib/categoryColors.ts`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: 写失败测试（schema 类型）**

在 `src/lib/categoryColors.test.ts` 新建并断言调色板行为：

```ts
import { describe, it, expect } from "vitest";
import { defaultCategoryColor, CATEGORY_COLORS, NO_CATEGORY_COLOR } from "./categoryColors";

describe("categoryColors", () => {
  it("默认色按序号循环取自调色板", () => {
    expect(defaultCategoryColor(0)).toBe(CATEGORY_COLORS[0]);
    expect(defaultCategoryColor(CATEGORY_COLORS.length)).toBe(CATEGORY_COLORS[0]);
  });
  it("无分类颜色为中性灰", () => {
    expect(NO_CATEGORY_COLOR).toBe("#9ca3af");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/categoryColors.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建调色板常量**

`src/lib/categoryColors.ts`：

```ts
/** 分类预设调色板（12 色）。 */
export const CATEGORY_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#06b6d4",
  "#ec4899", "#eab308", "#6366f1", "#f43f5e", "#92400e", "#84cc16",
] as const;

/** 「无分类」任务的默认颜色。 */
export const NO_CATEGORY_COLOR = "#9ca3af";

/** 按序号取默认分类色（循环）。 */
export function defaultCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
```

- [ ] **Step 4: 创建迁移 0004**

`src/db/migrations/0004_categories_color.sql`：

```sql
ALTER TABLE `categories` ADD `color` text;
--> statement-breakpoint
UPDATE `categories` SET `color` = CASE (`sort_order` % 12)
  WHEN 0 THEN '#3b82f6'
  WHEN 1 THEN '#22c55e'
  WHEN 2 THEN '#a855f7'
  WHEN 3 THEN '#f97316'
  WHEN 4 THEN '#ef4444'
  WHEN 5 THEN '#06b6d4'
  WHEN 6 THEN '#ec4899'
  WHEN 7 THEN '#eab308'
  WHEN 8 THEN '#6366f1'
  WHEN 9 THEN '#f43f5e'
  WHEN 10 THEN '#92400e'
  ELSE '#84cc16'
END;
```

- [ ] **Step 5: schema 增加 color 列**

`src/db/schema.ts` 的 `categories` 表加入一行（`sortOrder` 之后）：

```ts
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color"),
```

- [ ] **Step 6: 测试 + 构建 + 提交**

Run: `npm test` → 通过（migrate 用例会应用 0004）
Run: `npm run build` → 通过
```bash
git add src/lib/categoryColors.ts src/lib/categoryColors.test.ts src/db/migrations/0004_categories_color.sql src/db/schema.ts
git commit -m "feat(categories): 分类颜色字段（migration 0004）与调色板"
```

### Task B2: 仓库 / 服务 / Store 支持颜色

**Files:**
- Modify: `src/db/repositories/categoryRepository.ts`
- Modify: `src/services/categoryService.ts`
- Modify: `src/stores/taskStore.ts`
- Test: `src/db/repositories/categoryRepository.test.ts`、`src/services/categoryService.test.ts`

- [ ] **Step 1: 写失败测试（repository 颜色）**

在 `src/db/repositories/categoryRepository.test.ts` 追加：

```ts
it("create 自动分配默认颜色，update 可改颜色", async () => {
  const c = await categories.create("测试色");
  expect(c.color).toBeTruthy();
  const updated = await categories.update(c.id, { color: "#123456" });
  expect(updated?.color).toBe("#123456");
  const found = await categories.findById(c.id);
  expect(found?.color).toBe("#123456");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/db/repositories/categoryRepository.test.ts`
Expected: FAIL（create 不返回 color / update 签名不符）

- [ ] **Step 3: 修改 repository**

`src/db/repositories/categoryRepository.ts`：

```ts
import { defaultCategoryColor } from "../../lib/categoryColors";
```

`create` 的 values 加入 `color: defaultCategoryColor(await this.nextSortOrder()),`：

```ts
  async create(name: string): Promise<Category> {
    const rows = await this.db
      .insert(categories)
      .values({
        name,
        color: defaultCategoryColor(await this.nextSortOrder()),
        createdAt: Date.now(),
        sortOrder: await this.nextSortOrder(),
      })
      .returning()
      .all();
    return rows[0];
  }
```

`update` 签名改为对象并支持 color：

```ts
  async update(
    id: number,
    input: { name?: string; color?: string | null },
  ): Promise<Category | null> {
    const rows = await this.db
      .update(categories)
      .set(input)
      .where(eq(categories.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }
```

`seedDefaults` 中 `findByName` 已存在的分类若 `color` 为空则回填：

```ts
  async seedDefaults(): Promise<Category[]> {
    const result: Category[] = [];
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const name = DEFAULT_CATEGORIES[i];
      const existing = await this.findByName(name);
      if (existing) {
        if (!existing.color) {
          result.push((await this.update(existing.id, { color: defaultCategoryColor(i) }))!);
        } else {
          result.push(existing);
        }
      } else {
        result.push(await this.create(name));
      }
    }
    return result;
  }
```

- [ ] **Step 4: 修改 service 与 store**

`src/services/categoryService.ts`：`rename` 改为 `this.categories.update(id, { name })`，新增：

```ts
  async changeColor(id: number, color: string): Promise<Category | null> {
    return this.categories.update(id, { color });
  }
```

`src/stores/taskStore.ts`：接口新增 `changeCategoryColor: (id: number, color: string) => Promise<void>;`，实现：

```ts
  changeCategoryColor: async (id, color) => {
    try {
      await categoryService.changeColor(id, color);
      await get().load();
    } catch {
      fail("修改分类颜色失败");
    }
  },
```

- [ ] **Step 5: 测试 + 构建 + 提交**

Run: `npm test` → 通过
Run: `npm run build` → 通过
```bash
git add src/db/repositories/categoryRepository.ts src/services/categoryService.ts src/stores/taskStore.ts src/db/repositories/categoryRepository.test.ts
git commit -m "feat(categories): 分类颜色持久化（仓库/服务/Store）"
```

### Task B3: Settings 分类选色 UI

**Files:**
- Modify: `src/components/settings/CategoriesSection.tsx`
- Test: 无组件测试（人工验证）

- [ ] **Step 1: 加入选色状态与色块按钮**

`src/components/settings/CategoriesSection.tsx`：
1. import：`import { CATEGORY_COLORS, NO_CATEGORY_COLOR } from "../../lib/categoryColors";`
2. store 取 `changeCategoryColor`。
3. 组件顶部加 `const [colorOpenId, setColorOpenId] = useState<number | null>(null);`
4. 在每个分类行的「改名」按钮前加入色块按钮：

```tsx
          <button
            onClick={() => setColorOpenId(colorOpenId === c.id ? null : c.id)}
            className="h-5 w-5 shrink-0 rounded-full border border-neutral-300"
            style={{ background: c.color ?? NO_CATEGORY_COLOR }}
            aria-label="设置分类颜色"
          />
```

- [ ] **Step 2: 渲染调色板弹层**

在分类行 `</div>` 之后、`confirmDeleteId` 之前，追加：

```tsx
      {colorOpenId != null && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2">
          <div className="mb-1.5 flex items-center gap-1">
            {CATEGORY_COLORS.map((col) => (
              <button
                key={col}
                onClick={() => {
                  void changeCategoryColor(colorOpenId, col);
                  setColorOpenId(null);
                }}
                className="h-5 w-5 rounded-full border border-neutral-300"
                style={{ background: col }}
                aria-label={col}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">自定义</span>
            <input
              type="color"
              value={
                categories.find((c) => c.id === colorOpenId)?.color ?? NO_CATEGORY_COLOR
              }
              onChange={(e) => void changeCategoryColor(colorOpenId, e.target.value)}
              className="h-6 w-10 cursor-pointer"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 3: 构建 + 提交**

Run: `npm run build` → 通过
```bash
git add src/components/settings/CategoriesSection.tsx
git commit -m "feat(settings): 分类颜色选择器（预设 + 自定义）"
```

### Task B4: 时间轴块与任务列表着色

**Files:**
- Modify: `src/components/timeline/Timeline.tsx`
- Modify: `src/components/tasks/TaskList.tsx`

- [ ] **Step 1: Timeline 块按分类着色**

`src/components/timeline/Timeline.tsx`：
1. import `NO_CATEGORY_COLOR`（`from "../../lib/categoryColors"`）；`useTaskStore` 已有。
2. 组件内加 `const categories = useTaskStore((s) => s.categories);` 与：

```tsx
  const categoryColorMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.color ?? NO_CATEGORY_COLOR])),
    [categories],
  );
```

3. 块渲染里（`laneStyle` 之后）计算颜色并改样式：

```tsx
          const color =
            task.categoryId != null
              ? (categoryColorMap.get(task.categoryId) ?? NO_CATEGORY_COLOR)
              : NO_CATEGORY_COLOR;
```

外层 `<div>` 改为（去掉蓝色分支，`isRemoving` 保持红色覆盖）：

```tsx
            <div
              key={task.id}
              onMouseDown={(e) => startMove(e, task)}
              className={`absolute cursor-grab overflow-hidden rounded text-xs active:cursor-grabbing ${
                isRemoving
                  ? "bg-red-200 text-red-900 ring-2 ring-red-500"
                  : "text-neutral-900 hover:brightness-95"
              } ${laneStyle ? "" : "left-1 right-1"}`}
              style={{
                top,
                height,
                backgroundColor: isRemoving ? undefined : `${color}26`,
                borderLeft: isRemoving ? undefined : `3px solid ${color}`,
                ...laneStyle,
              }}
            >
```

- [ ] **Step 2: TaskList 加分类色点**

`src/components/tasks/TaskList.tsx`：
1. import `NO_CATEGORY_COLOR`；`categoryMap` 已有（id→name）。
2. 新增颜色映射：`const colorMap = new Map(categories.map((c) => [c.id, c.color ?? NO_CATEGORY_COLOR]));`
3. 把 `<span className="flex-1">` 整块替换为（标题前加色点，分类/时长行不变）：

```tsx
              <span className="flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        task.categoryId != null
                          ? (colorMap.get(task.categoryId) ?? NO_CATEGORY_COLOR)
                          : NO_CATEGORY_COLOR,
                    }}
                  />
                  <span
                    className={`block text-sm ${
                      done || cancelled
                        ? "text-neutral-400 line-through"
                        : "text-neutral-900"
                    }`}
                  >
                    {task.title}
                  </span>
                </span>
                <span className="block text-xs text-neutral-500">
                  {task.categoryId != null
                    ? (categoryMap.get(task.categoryId) ?? "")
                    : ""}
                  {task.estimatedDuration != null
                    ? `${task.categoryId != null ? " · " : ""}${formatDuration(task.estimatedDuration)}`
                    : ""}
                </span>
              </span>
```

- [ ] **Step 3: 测试 + 构建 + 提交**

Run: `npm test` → 通过
Run: `npm run build` → 通过
```bash
git add src/components/timeline/Timeline.tsx src/components/tasks/TaskList.tsx
git commit -m "feat(ui): 时间轴任务块与任务列表按分类着色"
```

---

## 阶段 C：快速创建 + 删除撤销

### Task C1: Toast 支持操作按钮与自定义时长

**Files:**
- Modify: `src/stores/appStore.ts`
- Modify: `src/components/Toasts.tsx`
- Test: `src/stores/appStore.test.ts`

- [ ] **Step 1: 写失败测试**

`src/stores/appStore.test.ts` 追加：

```ts
it("pushToast 支持操作按钮与自定义时长", () => {
  const onAction = vi.fn();
  useAppStore.getState().pushToast("info", "已删除", { actionLabel: "撤销", onAction, durationMs: 8000 });
  const t = useAppStore.getState().toasts.at(-1);
  expect(t?.actionLabel).toBe("撤销");
  expect(t?.onAction).toBe(onAction);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/appStore.test.ts`
Expected: FAIL（toast 无 actionLabel 字段）

- [ ] **Step 3: 修改 appStore**

`src/stores/appStore.ts`：

```ts
export interface Toast {
  id: number;
  type: ToastType;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}
```

`pushToast` 签名与实现改为：

```ts
  pushToast: (type, text, options?: ToastOptions) => {
    const id = ++toastId;
    set({
      toasts: [
        ...get().toasts,
        { id, type, text, actionLabel: options?.actionLabel, onAction: options?.onAction },
      ],
    });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, options?.durationMs ?? 3500);
  },
```

- [ ] **Step 4: 修改 Toasts 渲染按钮**

`src/components/Toasts.tsx` 的 toast 内容区，关闭按钮之前加：

```tsx
          {t.actionLabel && (
            <button
              onClick={() => {
                t.onAction?.();
                removeToast(t.id);
              }}
              className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              {t.actionLabel}
            </button>
          )}
```

- [ ] **Step 5: 测试 + 构建 + 提交**

Run: `npm test` → 通过
Run: `npm run build` → 通过
```bash
git add src/stores/appStore.ts src/components/Toasts.tsx src/stores/appStore.test.ts
git commit -m "feat(toast): 支持操作按钮与自定义时长"
```

### Task C2: 任务/专注记录恢复（restore + Service 捕获）

**Files:**
- Modify: `src/db/repositories/taskRepository.ts`
- Modify: `src/db/repositories/focusSessionRepository.ts`
- Modify: `src/services/taskService.ts`
- Test: `src/services/taskService.test.ts`

- [ ] **Step 1: 写失败测试**

`src/services/taskService.test.ts` 追加（先确认该文件已 import `FocusSessionRepository` 与 `FocusService`；若没有，加上，并用 `new FocusSessionRepository(db)` 构造 TaskService 时传入 sessions）：

```ts
it("deleteTaskWithSessions 捕获任务+专注记录并可恢复", async () => {
  const sessions = new FocusSessionRepository(db);
  const service = new TaskService(new TaskRepository(db), sessions);
  const task = await service.createTask({ title: "待删" });
  await sessions.create({ taskId: task.id, plannedDuration: 1500, startedAt: 1000 });
  const captured = await service.deleteTaskWithSessions(task.id);
  expect(captured?.task.id).toBe(task.id);
  expect(captured?.sessions.length).toBe(1);
  expect(await service.getTask(task.id)).toBeNull();
  await service.restoreTaskWithSessions(captured!);
  const restored = await service.getTask(task.id);
  expect(restored?.title).toBe("待删");
  expect((await sessions.findByTaskId(task.id)).length).toBe(1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/services/taskService.test.ts`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 restore 方法**

`src/db/repositories/taskRepository.ts` 末尾追加：

```ts
  /** 按原字段原样恢复已删除的任务（撤销删除用，显式指定 id）。 */
  async restore(task: Task): Promise<Task> {
    const rows = await this.db
      .insert(tasks)
      .values({
        id: task.id,
        title: task.title,
        categoryId: task.categoryId,
        status: task.status,
        estimatedDuration: task.estimatedDuration,
        plannedStart: task.plannedStart,
        plannedEnd: task.plannedEnd,
        actualDuration: task.actualDuration,
        scheduledDate: task.scheduledDate,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt,
      })
      .returning()
      .all();
    return rows[0];
  }
```

`src/db/repositories/focusSessionRepository.ts` 末尾追加：

```ts
  /** 按原字段原样恢复（撤销删除用，显式指定 id）。 */
  async restore(session: FocusSession): Promise<FocusSession> {
    const rows = await this.db
      .insert(focusSessions)
      .values({
        id: session.id,
        taskId: session.taskId,
        plannedDuration: session.plannedDuration,
        actualDuration: session.actualDuration,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        completed: session.completed,
        createdAt: session.createdAt,
      })
      .returning()
      .all();
    return rows[0];
  }
```

- [ ] **Step 4: 修改 TaskService**

`src/services/taskService.ts`：

```ts
import {
  FocusSessionRepository,
  type FocusSession,
} from "../db/repositories/focusSessionRepository";
```

构造函数加可选 sessions，并新增方法：

```ts
export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly sessions?: FocusSessionRepository,
  ) {}

  async getTask(id: number): Promise<Task | null> {
    return this.tasks.findById(id);
  }

  /** 删除前捕获任务与专注记录，随后级联删除；返回捕获数据用于撤销。 */
  async deleteTaskWithSessions(
    id: number,
  ): Promise<{ task: Task; sessions: FocusSession[] } | null> {
    const task = await this.tasks.findById(id);
    if (!task) return null;
    const sessions = this.sessions ? await this.sessions.findByTaskId(id) : [];
    await this.tasks.delete(id); // 级联删除专注记录
    return { task, sessions };
  }

  /** 按原 id 恢复任务及其专注记录（先任务后记录，满足外键）。 */
  async restoreTaskWithSessions(data: { task: Task; sessions: FocusSession[] }): Promise<void> {
    await this.tasks.restore(data.task);
    if (this.sessions) {
      for (const s of data.sessions) {
        await this.sessions.restore(s);
      }
    }
  }
```

- [ ] **Step 5: 测试 + 构建 + 提交**

Run: `npm test` → 通过
Run: `npm run build` → 通过
```bash
git add src/db/repositories/taskRepository.ts src/db/repositories/focusSessionRepository.ts src/services/taskService.ts src/services/taskService.test.ts
git commit -m "feat(tasks): 删除捕获与按原 id 恢复（撤销删除基础）"
```

### Task C3: 删除撤销（taskStore）

**Files:**
- Modify: `src/stores/taskStore.ts`

- [ ] **Step 1: 修改 taskStore**

`src/stores/taskStore.ts`：
1. import：`import type { FocusSession } from "../db/repositories/focusSessionRepository";`
2. `taskService` 实例化改为 `new TaskService(new TaskRepository(getDb()), new FocusSessionRepository(getDb()))`（`FocusSessionRepository` 需 import）。
3. 接口新增 `restoreTask: (captured: { task: Task; sessions: FocusSession[] }) => Promise<void>;`
4. `deleteTask` 改为捕获 + 撤销 Toast；新增 `restoreTask`：

```ts
  deleteTask: async (id) => {
    try {
      const captured = await taskService.deleteTaskWithSessions(id);
      if (!captured) return;
      useAppStore.getState().pushToast("info", "任务已删除", {
        actionLabel: "撤销",
        onAction: () => {
          void get().restoreTask(captured);
        },
        durationMs: 8000,
      });
      await get().load();
    } catch {
      fail("删除任务失败");
    }
  },

  restoreTask: async (captured) => {
    try {
      await taskService.restoreTaskWithSessions(captured);
      await get().load();
    } catch {
      fail("恢复任务失败");
    }
  },
```

- [ ] **Step 2: 测试 + 构建 + 提交**

Run: `npm test` → 通过
Run: `npm run build` → 通过
```bash
git add src/stores/taskStore.ts
git commit -m "feat(tasks): 删除任务弹撤销 Toast，可一键恢复"
```

### Task C4: 快速创建输入行

**Files:**
- Create: `src/components/tasks/QuickAddTask.tsx`
- Modify: `src/pages/Today.tsx`
- Test: `src/components/tasks/QuickAddTask.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/components/tasks/QuickAddTask.test.tsx`（仿 TaskList.test.tsx 的 store mock 模式）：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import QuickAddTask from "./QuickAddTask";

const mockState = vi.hoisted(() => ({
  categories: [],
  createTask: vi.fn(),
}));

vi.mock("../../stores/taskStore", () => ({
  useTaskStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));

afterEach(cleanup);

describe("QuickAddTask", () => {
  beforeEach(() => {
    mockState.createTask.mockClear();
  });

  it("输入标题回车创建任务", async () => {
    render(<QuickAddTask />);
    fireEvent.change(screen.getByPlaceholderText("快速添加任务，回车创建"), {
      target: { value: "写代码" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("快速添加任务，回车创建"), { key: "Enter" });
    await vi.waitFor(() =>
      expect(mockState.createTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: "写代码", categoryId: null, estimatedDuration: null }),
      ),
    );
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/tasks/QuickAddTask.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 创建组件**

`src/components/tasks/QuickAddTask.tsx`：

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";

export default function QuickAddTask() {
  const categories = useTaskStore((s) => s.categories);
  const createTask = useTaskStore((s) => s.createTask);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minutes, setMinutes] = useState("");

  const canSubmit = title.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const m = Number(minutes);
    await createTask({
      title: title.trim(),
      categoryId: categoryId === "" ? null : Number(categoryId),
      estimatedDuration:
        minutes === "" || !Number.isFinite(m) || m < 0 ? null : Math.round(m * 60),
    });
    setTitle("");
    setMinutes("");
  };

  return (
    <div className="mb-2 space-y-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        placeholder="快速添加任务，回车创建"
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      <div className="flex gap-1.5">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
        >
          <option value="">无分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="分钟"
          className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-xs"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="flex items-center justify-center rounded-md bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300"
          aria-label="添加任务"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 接入 Today 页**

`src/pages/Today.tsx`：import `QuickAddTask`，在左栏「今日任务」标题 div 之后、`{loading ? ... : <TaskList />}` 之前插入：

```tsx
          <QuickAddTask />
```

- [ ] **Step 5: 测试 + 构建 + 提交**

Run: `npm test` → 全部通过
Run: `npm run build` → 通过
```bash
git add src/components/tasks/QuickAddTask.tsx src/components/tasks/QuickAddTask.test.tsx src/pages/Today.tsx
git commit -m "feat(today): 任务列表顶部快速创建输入行"
```

---

## 收尾

- [ ] 全量回归：`npm test`（预期 233 + 新增 ≈ 245+ 全绿）与 `npm run build` 通过
- [ ] 人工验证清单：
  - 重叠任务并排分栏、拖拽实时让位、>6 轻提示、非重叠全宽
  - 分类颜色：Settings 选色即时生效、时间轴块底色+左色条、列表色点、无分类灰色
  - 快速创建：输入+回车、分类/时长可选、列表即时出现
  - 删除撤销：删除后 8 秒内撤销恢复任务与专注记录
  - 回归：Pomodoro、News、Timeline 拖拽缩放拖出、快捷键

## Self-Review 备注

- 阶段 A 移除 `findOverlappingIds` 使用后，`src/lib/timeline.ts` 中的该函数保留（仍被其它地方引用则不动；无引用时可按计划内未使用删除——执行时 grep 确认）。
- 阶段 B `categoryRepository.update` 签名变更会影响 `categoryService.rename`，Step 4 已同步修改；若既有 `categoryRepository.test.ts` / `categoryService.test.ts` 直接以字符串调用 `update(id, name)`，需同步改为 `update(id, { name })`。`seedDefaults` 在 `databaseService.init()` 每次启动调用，color 回填逻辑幂等。
- 阶段 C `TaskService` 构造新增可选参数，`taskStore` 已同步传 `FocusSessionRepository`；`taskService.test.ts` 既有用例不受影响（sessions 可选）。
