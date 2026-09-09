# DailyFlow Tauri 关键流程端到端回归 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用 Playwright 连接真实 Tauri WebView2，自动验证核心导航、启动诊断、扩展权限展示和任务创建清理流程。

**Architecture:** 开发环境通过 WebView2 CDP 端口暴露当前 Tauri 页面，Python Playwright 脚本只连接既有桌面进程，不启动第二份应用。测试先执行只读检查，再创建带唯一 `DailyFlow E2E` 前缀的任务，并只删除本次创建的任务；任何步骤失败时在 `finally` 中尝试清理并保存截图与 JSON 报告。

**Tech Stack:** Tauri 2、WebView2、Python Playwright、Vite、npm scripts。

---

### Task 1: 验证真实 WebView 调试通道

**Files:**
- Modify: `package.json`
- Create: `scripts/qa_tauri_e2e.py`

- [x] **Step 1: 使用仅限 E2E 的 Tauri 配置在 9222 开放 WebView2 CDP，并重启 Tauri dev。**
- [x] **Step 2: 用 Playwright `connect_over_cdp` 枚举页面，确认能读取 DailyFlow 标题与“已保存到本机”。**
- [x] **Step 3: 连接失败时输出明确启动命令和可诊断错误，不回退到浏览器空壳。**

### Task 2: 固化只读关键路径

**Files:**
- Modify: `scripts/qa_tauri_e2e.py`

- [x] **Step 1: 点击“设置 → 关于”，断言启动诊断及数据库、设置、扩展阶段结果可见。**
- [x] **Step 2: 点击“扩展”，断言课程表、Workflow 与权限标签可见。**
- [x] **Step 3: 捕获页面错误和 console error，并在报告中给出失败阶段。**

### Task 3: 验证任务写入并清理测试数据

**Files:**
- Modify: `scripts/qa_tauri_e2e.py`

- [x] **Step 1: 返回“今日”，通过新建任务创建带时间戳的唯一任务。**
- [x] **Step 2: 在任务列表中打开该任务并断言详情标题一致。**
- [x] **Step 3: 只点击该任务详情内的删除按钮，等待任务从列表消失。**
- [x] **Step 4: 在 `finally` 中再次检测并清理本次任务，失败时保存截图。**

### Task 4: 项目命令、文档和回归

**Files:**
- Modify: `package.json`
- Create: `docs/qa/tauri-e2e.md`

- [x] **Step 1: 增加 `qa:tauri:e2e` 命令，并记录启动、执行与产物位置。**
- [x] **Step 2: 执行真实 Tauri E2E，确认任务数据无残留。**
- [x] **Step 3: 运行 TypeScript、完整 Vitest、生产构建、Rust 测试和 `git diff --check`。**
