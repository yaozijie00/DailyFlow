# 成就：统一比例与状态对齐

## 问题

网格内部多包一层动画容器，按钮没有占满单元格；不同解锁状态使用不同高度的底部内容，造成宽高不一致。描述只显示一行，信息难以辨认；整页依次滑入增加不必要的动效。

## 参考与取舍

- Xbox：完成状态一眼可辨、筛选与展示分离。https://news.xbox.com/en-us/2026/04/08/xbox-insiders-may-2026-console-features/
- Apple Activity：成就概览与详情分层。https://support.apple.com/en-euro/guide/watch/apd3bf6d85a6/watchos
- 使用已调研的 frontend-design / ui-ux-pro-max 方法：统一对齐、有限文字层级、可见焦点、响应网格。保留 DailyFlow 主题，不复制游戏排行榜、彩色奖杯墙。

## 改动

- 直接网格布局：卡片撑满格子，行高统一，最小高度 172px；根据可用宽度自然换列。
- 统一 44px 图标、标题与两行描述区域，完整内容通过详情查看。
- 已解锁/进行中/隐藏状态共用底部结构，状态和进度位置一致。
- 移除瀑布式进入动效，保留克制的 hover/pressed/focus，尊重 reduced-motion。
- 零进度绘制为 0；隐藏成就卡片与详情不泄露条件。
- 合并 task/tasks、secret/category 的展示分类，不迁移已有成就数据。

## 验证

隔离桌面 820/900/1100/1440 × 深浅主题，共 8 组，实测卡片宽高差小于 1px，无横向溢出，详情与末尾卡片可达。截图与日志在 `artifacts/achievement-layout/`。本轮保留已有专注页改动，不修改旧发布标签。

最终回归：98 个测试文件、734 项测试通过；TypeScript 与生产构建通过。正式安装包尚未替换。
