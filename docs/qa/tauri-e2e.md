# DailyFlow Tauri 端到端回归

这套检查通过 Playwright 连接真实 Tauri WebView2，使用当前应用数据库、扩展宿主和桌面窗口。普通浏览器中的 Vite 页面缺少 Tauri IPC，不能替代本检查。

## 运行方式

先在一个终端启动仅用于测试的开发配置：

```powershell
npm run tauri:e2e
```

该配置只在本机 `127.0.0.1:9222` 打开 WebView2 调试端口。正式 `npm run tauri dev` 和安装包不会启用此参数。

待 DailyFlow 窗口出现后，在另一个终端执行：

```powershell
npm run qa:tauri:e2e
```

## 验证范围

- 桌面壳与真实 SQLite 初始化完成；
- “设置 → 关于”的五项启动诊断可见；
- 扩展管理显示课程表、Workflow 及权限声明；
- Workflow 偏好开关可以保存，并在检查后恢复用户原值；
- 从今日页创建任务、打开对应详情并删除；
- 整个流程没有新的 console error 或页面异常。

测试任务使用 `DailyFlow E2E <时间>-<随机值>` 唯一名称。脚本只删除本次创建的任务，并在失败后的 `finally` 阶段再次清理；Workflow 偏好也会恢复为运行前的状态。结果写入 `artifacts/qa/tauri-e2e/report.json`，失败时附带 `failure.png`。
