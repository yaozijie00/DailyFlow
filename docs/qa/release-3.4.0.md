# DailyFlow 3.4.0 发布验证记录

验证日期：2026-10-09。版本文件、npm 根锁文件及 Cargo 锁文件均已统一为 3.4.0。

## 发布产物

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `release/DailyFlow_3.4.0_x64-setup.exe` | 220,511,546 | `1967B3449CA84D8B14EF483BEEC1965E9C8476C7178F85335EB5A793888DA58D` |
| `src-tauri/target/release/dailyflow.exe` | 13,815,808 | `294EB84F8F368D81E770038B40371C13303EA921788E54E33D0868CC0E2DEDD6` |

发布程序的文件版本、产品版本以及安装器文件版本均为 3.4.0。安装包由正式 Tauri 配置构建，目标为 Windows x64 NSIS，包含 WebView2 离线安装器。本地 release 副本与 bundle 原始产物的 SHA-256 一致；旧版安装包保留。

`release/SHA256SUMS.txt` 保存本地安装包校验值，`release/RELEASE-INFO.json` 保存最新版本与提交信息。安装包和构建输出沿用仓库忽略规则，Git 提交包含源码、更新日志和本验证记录。

## 发布检查

| 检查 | 结果 |
| --- | --- |
| Vitest | 101 个测试文件、749 项测试通过。 |
| Rust 原生测试 | 28 项通过。 |
| Rust 格式检查 | `cargo fmt -- --check` 通过。 |
| Rust 静态检查 | `cargo clippy --offline --all-targets -- -D warnings` 通过。 |
| 正式生产构建及打包 | `npm run tauri -- build` 成功，退出码 0；TypeScript、Vite、Rust release 编译和 NSIS 均完成。 |
| 差异检查 | `git diff --check` 通过。 |
| 功能与布局 | 本轮实现已通过真实 Tauri 五条核心流程、主窗口与 Mini 外观及计时同步、192 组布局和最小尺寸界面检查。见[实施记录](../dailyflow-experience-implementation-2026-10-09.md)。 |

release 编译输出一条 MSVC 链接器信息警告（生成导入库与导出对象），构建成功；Clippy 检查无警告。未运行安装 / 卸载流程，也未启动正式发布程序读取用户日常数据库。

发布日志位于本地 `artifacts/experience-implementation/`：`vitest-release.log`、`cargo-release.log`、`fmt-release.log`、`clippy-release.log`、`tauri-build-3.4.0.log`。真实界面验证使用独立 QA 数据库，debug 专用数据覆盖和调试浏览器参数未进入正式构建。

## 版本内容

新增长期甘特图与里程碑；统一任务详情；重构专注与无任务计时；增加收集箱展开整理、批量归属和来源追踪；提供经典、纸感、森林、石墨风格并同步 Mini。详细改动见 [CHANGELOG](../../CHANGELOG.md)。
