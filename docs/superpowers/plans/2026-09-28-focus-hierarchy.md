# Focus 实施计划

1. FocusWorkspace：重组 Idle 推荐与模式设置；拆分 Running 主内容与 TaskContext；历史渐进展开。保留所有存储调用和完成语义。
2. FocusController：按钮内联对齐；按页面隐藏重复控制条，结束/切换面板保留；补充回归测试。
3. focus.css：统一文字层级、主次栏、状态、表单和响应布局；保持 reduced-motion 与键盘焦点。
4. 补充工作区状态测试，运行完整测试与构建；使用隔离桌面数据验证和截图。

不修改 SQLite schema、原生计时、现有发布标签或已有正式安装包。
