# DailyFlow 扩展存储设计

## 目标

为后续扩展提供统一、可测试、可迁移的持久化入口。扩展通过 `CoreContext.storage` 读写 JSON 数据，不接触 Core 数据库、SettingsRepository 或其它扩展的命名空间。

## 数据模型

- `extension_storage`：以 `extension_id + key` 唯一定位 JSON 值，记录更新时间。
- `extension_storage_meta`：每个扩展一行，记录已经完成的数据版本。
- 两张表都位于 DailyFlow 主库，因此自动参与现有主库备份与恢复。

扩展 ID 由宿主在激活时绑定，Storage API 不接收扩展 ID。键必须是 1–128 位的字母、数字、点、下划线或连字符，并以字母或数字开头。

## API

`CoreContext.storage` 仅在 manifest 声明 `storage.extension` 后存在：

- `get<T>(key)`：读取并解析 JSON，不存在时返回 `null`。
- `set(key, value)`：写入 JSON 值，覆盖同名键。
- `delete(key)`：删除本扩展的键并返回是否存在。
- `keys()`：按字典序列出本扩展的键。
- `version()`：读取扩展数据版本，初始为 `0`。
- `migrate(targetVersion, migrations)`：顺序执行缺失版本，单步成功后才记录版本。

迁移必须提供从当前版本下一位到目标版本的连续步骤。迁移失败会保留最近一个成功版本；由于 SQLite 代理不能保证跨连接事务，迁移函数必须幂等。

## 边界

- `storage.extension` 是宿主管理的轻量 JSON 存储，适合设置、缓存索引和中小型扩展数据。
- 大型关系数据仍可使用独立 SQLite，但需自行实现迁移、关闭和备份参与者。
- 禁用扩展不会删除数据。
- 当前扩展均保持原有业务表，本阶段不做高风险的数据搬迁。

## 验收

- 不同扩展使用相同键时互不影响。
- 缺少能力时无法获得 Storage API。
- JSON 往返、删除、键列表与非法输入均有测试。
- 迁移支持首次执行、重复执行、连续升级和失败重试。
- 完整前端测试、生产构建与真实 Tauri E2E 通过。
