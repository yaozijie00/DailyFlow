# DailyFlow Extension Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为扩展平台增加宿主管理、按扩展隔离且支持版本迁移的 JSON 持久化 API。

**Architecture:** Core 数据库保存扩展键值与版本元数据；Repository 负责命名空间查询，Storage 服务负责 JSON、键校验与迁移协议，Registry 在激活时按 manifest 能力注入绑定扩展 ID 的实例。

**Tech Stack:** React 19、TypeScript、Drizzle ORM、SQLite、Vitest、Tauri WebView2。

---

### Task 1: 数据表与 Repository

**Files:**
- Create: `src/db/migrations/0023_extension_storage.sql`
- Create: `src/db/repositories/extensionStorageRepository.ts`
- Create: `src/db/repositories/extensionStorageRepository.test.ts`
- Modify: `src/db/schema.ts`

- [x] **Step 1: 写命名空间隔离、覆盖、删除、键列表和版本测试。**
- [x] **Step 2: 添加扩展存储与元数据迁移。**
- [x] **Step 3: 实现只接受固定 extensionId 的 Repository。**
- [x] **Step 4: 运行 Repository 与迁移测试。**

### Task 2: JSON 与版本迁移服务

**Files:**
- Create: `src/extensions/storage.ts`
- Create: `src/extensions/storage.test.ts`
- Modify: `src/extensions/types.ts`

- [x] **Step 1: 写 JSON 往返、非法键和值测试。**
- [x] **Step 2: 写首次迁移、幂等、连续性和失败重试测试。**
- [x] **Step 3: 实现 ExtensionStorage API 与串行迁移。**
- [x] **Step 4: 运行存储服务测试与 TypeScript 检查。**

### Task 3: 权限注入与开发文档

**Files:**
- Modify: `src/extensions/registry.ts`
- Modify: `src/extensions/platform.test.ts`
- Modify: `docs/extension-authoring-zh.md`

- [x] **Step 1: 在 Registry 中按 extensionId 注入存储实例。**
- [x] **Step 2: 验证缺少 `storage.extension` 时 API 不可见。**
- [x] **Step 3: 补充扩展作者用法、迁移约束与选型说明。**
- [x] **Step 4: 运行扩展平台相关测试。**

### Task 4: 集成验收

- [x] **Step 1: 运行完整 Vitest 与生产构建。**
- [x] **Step 2: 运行真实 Tauri E2E 并确认测试数据清理。**
- [x] **Step 3: 恢复普通开发模式，确认页面可用且 9222 关闭。**
- [x] **Step 4: 运行 `git diff --check` 并完成计划记录。**
