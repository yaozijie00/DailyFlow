# DailyFlow 3.2.0 发布验证记录

验证日期：2026-09-09

## 发布产物

| 产物 | 大小 | SHA-256 |
| --- | ---: | --- |
| `src-tauri/target/release/bundle/nsis/DailyFlow_3.2.0_x64-setup.exe` | 169,736,377 字节（161.87 MB） | `6989B1E73F80A3FFC2EF89AD66A14B8F9A2FAE18C265DFB38EC5C078D495D18A` |
| `src-tauri/target/release/dailyflow.exe` | 13,456,384 字节（12.83 MB） | `B69D105CA76DCA7BE5A7FA27085448F2BA25A02F796CCF7EF27B83C264C15610` |

发布程序的文件版本和产品版本均为 `3.2.0`。Windows、macOS、Android 和 iOS 图标资源均由 `assets/ICON.png` 生成。

## 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| Vitest | 96 个测试文件、798 项测试全部通过 |
| Vite 生产构建 | 通过；2713 个模块；最大 JavaScript 分块 247.57 KB；0 条构建警告 |
| `cargo fmt -- --check` | 通过 |
| `cargo clippy --all-targets -- -D warnings` | 通过，0 条 Clippy 警告 |
| `cargo test` | 19 项测试全部通过 |
| 响应式检查 | 800×600、960×720、1180×800、1440×900 全部无横向溢出与控制台错误 |
| 真实 Tauri E2E | 8 个步骤全部通过；偏好恢复、测试任务清理完成；0 个控制台或页面错误 |

响应式报告保存在 `artifacts/qa/responsive/report.json`，真实桌面报告保存在 `artifacts/qa/tauri-e2e/report.json`。

## 发布与安装冒烟

- 直接启动 release EXE：进程正常响应，隔离数据目录成功创建 SQLite 数据库。
- 静默安装 NSIS：返回码 0，安装后程序版本为 `3.2.0`。
- 启动已安装程序：进程正常响应，隔离数据目录成功创建 SQLite 数据库。
- 静默卸载：返回码 0，安装目录中的程序文件已移除。

证据分别保存在 `artifacts/qa/release/release-smoke.json` 和 `artifacts/qa/release/installer-smoke.json`。
