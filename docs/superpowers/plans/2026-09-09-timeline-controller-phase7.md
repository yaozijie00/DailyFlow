# DailyFlow Timeline Controller Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将时间轴全局拖拽生命周期提取为两个可测试 Hook，使 `Timeline.tsx` 成为 400 行以内的装配与渲染组件。

**Architecture:** 外部来源拖放与画布内部交互分开。Hook 通过参数接收数据和命令，不直接依赖 Zustand；现有 `lib/timeline.ts` 继续承担纯坐标与布局算法。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library、Tauri WebView2。

---

### Task 1: 画布交互控制器

**Files:**
- Create: `src/components/timeline/useTimelineCanvasInteractions.ts`
- Create: `src/components/timeline/useTimelineCanvasInteractions.test.tsx`
- Modify: `src/components/timeline/Timeline.tsx`

- [x] **Step 1: 写空白区创建、任务缩放、移出时间轴和取消状态测试。**
- [x] **Step 2: 实现画布控制器，返回预览、换栏偏好和四类入口处理函数。**
- [x] **Step 3: `Timeline.tsx` 改用控制器，并保持分栏布局读取最新状态。**
- [x] **Step 4: 运行目标测试与 TypeScript 检查。**

### Task 2: 外部拖入控制器

**Files:**
- Create: `src/components/timeline/useTimelineExternalDrops.ts`
- Modify: `src/components/timeline/Timeline.tsx`

- [x] **Step 1: 提取任务列表拖入的悬停、落点保存和监听器清理。**
- [x] **Step 2: 提取便签 Ghost 与带 undo 批次的转换回调。**
- [x] **Step 3: 确认 Hook 不直接读取 Store，并运行现有便签、任务可靠性测试。**

### Task 3: 集成验收

**Files:**
- Modify: `docs/superpowers/plans/2026-09-09-timeline-controller-phase7.md`

- [x] **Step 1: 确认 `Timeline.tsx` 不超过 400 行且差异无空白错误。**
- [x] **Step 2: 运行完整 Vitest 和生产构建。**
- [x] **Step 3: 运行真实 Tauri E2E，恢复普通开发模式并确认调试端口关闭。**
