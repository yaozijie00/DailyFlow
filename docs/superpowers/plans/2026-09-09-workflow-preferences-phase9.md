# DailyFlow Workflow Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Workflow 的真实用户偏好验证扩展存储升级路径，并强化扩展清单兼容性检查。

**Architecture:** 非 React 偏好模块封装 Storage API 和 v1→v2 迁移；Workflow 页面只消费同步快照，设置贡献负责异步保存。Manifest 校验在 Registry 加载前拒绝不稳定标识和版本元数据。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Tauri WebView2。

---

### Task 1: Workflow 偏好迁移

**Files:**
- Create: `src/extensions/builtin/workflow/preferences.ts`
- Create: `src/extensions/builtin/workflow/preferences.test.ts`
- Modify: `src/extensions/builtin/workflow/index.ts`

- [x] **Step 1: 写首次初始化、v1 升 v2、重复初始化和保存失败测试。**
- [x] **Step 2: 实现偏好快照、迁移与持久化。**
- [x] **Step 3: 在 Workflow init 中接入 storage 并登记停用清理。**
- [x] **Step 4: 运行偏好与扩展存储测试。**

### Task 2: 设置贡献与创建行为

**Files:**
- Create: `src/extensions/builtin/workflow/Settings.tsx`
- Create: `src/extensions/builtin/workflow/Settings.test.tsx`
- Modify: `src/extensions/builtin/workflow/Page.tsx`
- Modify: `src/extensions/builtin/workflow/Page.test.tsx`

- [x] **Step 1: 写设置开关保存成功与失败测试。**
- [x] **Step 2: 贡献 Workflow 偏好设置页。**
- [x] **Step 3: 让创建后导航读取当前偏好并补回归测试。**
- [x] **Step 4: 运行 Workflow UI 测试。**

### Task 3: Manifest 兼容性

**Files:**
- Modify: `src/extensions/types.ts`
- Modify: `src/extensions/registry.ts`
- Modify: `src/extensions/platform.test.ts`
- Modify: `docs/extension-authoring-zh.md`

- [x] **Step 1: 写 ID、SemVer、API 整数与兼容错误测试。**
- [x] **Step 2: 实现清单格式与宿主 API 兼容性校验。**
- [x] **Step 3: Registry 为不兼容扩展记录加载诊断。**
- [x] **Step 4: 更新扩展开发约定并运行平台测试。**

### Task 4: 集成验收

- [x] **Step 1: 运行完整 Vitest 与生产构建。**
- [x] **Step 2: 运行真实 Tauri E2E 并确认测试数据清理。**
- [x] **Step 3: 恢复普通开发模式并确认页面与端口状态。**
- [x] **Step 4: 运行差异检查并完成计划记录。**
