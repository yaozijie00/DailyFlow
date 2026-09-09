# DailyFlow 3.2.0 Release Finalization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将阶段 1–9 的优化统一为可安装、可验证、文档完整的 DailyFlow 3.2.0 Windows 发布候选版本。

**Architecture:** 不再增加产品功能；统一版本与图标资源，执行前端、Rust、响应式、真实桌面和安装包五层质量门禁，保留可复核报告与哈希。

**Tech Stack:** Tauri 2、React 19、TypeScript、Rust、Vitest、Playwright、NSIS。

---

### Task 1: 发布元数据

- [x] **Step 1: 从用户确认的 `assets/ICON.png` 生成全部 Tauri 图标。**
- [x] **Step 2: 将 npm、Tauri、Cargo 和 Lockfile 版本统一为 3.2.0。**
- [x] **Step 3: 修正 Cargo 描述编码并更新 README、CHANGELOG。**
- [x] **Step 4: 标记旧计划为历史记录，避免误判为当前待办。**

### Task 2: 代码质量门禁

- [x] **Step 1: 扫描生产代码 TODO/FIXME/HACK 与占位实现。**
- [x] **Step 2: 运行完整 Vitest 与 TypeScript/Vite 生产构建。**
- [x] **Step 3: 运行 Cargo fmt check、Clippy、Cargo test。**
- [x] **Step 4: 运行差异空白检查和版本一致性检查。**

### Task 3: 桌面与布局验收

- [x] **Step 1: 运行四档视口响应式检查。**
- [x] **Step 2: 运行真实 Tauri E2E，确认偏好和测试任务均恢复。**
- [x] **Step 3: 记录报告位置与运行时错误数量。**

### Task 4: 安装包候选

- [x] **Step 1: 构建 NSIS 安装包。**
- [x] **Step 2: 校验文件版本、大小、图标和 SHA-256。**
- [x] **Step 3: 对 release EXE 执行隔离数据目录冒烟。**
- [x] **Step 4: 恢复普通开发模式并完成发布记录。**
