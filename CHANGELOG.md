# Changelog

## DailyFlow 1.1.0

### Features

* 设置页分组（General / Pomodoro / Shortcuts / Categories / Storage / Data）
* 可自定义应用内快捷键（防重复绑定、冲突提示、恢复默认、输入框内不触发）
* 任务分类管理（增/改/删/排序；删除分类任务自动置空，不丢失）
* 存储位置设置（数据/缓存/备份目录；路径校验、自动建目录、重启生效、不自动迁移）
* 番茄钟设置扩展（专注/短休息/长休息/长休间隔）

### Technical

* categories 新增 sort_order 列（迁移 0001，回填按 id）
* 存储路径存库外 storage.json（Rust 启动读取）
* 新增测试：shortcuts / storagePaths / categoryService / categoryRepository 扩展

## DailyFlow 1.0.0

### Features

* Daily Task Management
* Timeline Planning
* Pomodoro Focus
* Statistics
* Local SQLite Storage
* Backup

### Technical

* React
* Tauri
* SQLite
* Drizzle ORM
