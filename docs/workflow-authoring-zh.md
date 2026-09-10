# Workflow 模板与节点开发指南

Workflow 用于固化可重复执行的工作方法。模板只保存声明式变量、节点和连线；每次运行都会保存模板与变量快照，因此修改或删除原模板不会改变历史记录。

## 模板结构

模板使用 `WorkflowV2`：

- `id` 使用稳定命名空间；内置模板以 `builtin.` 开头，个人副本使用新 ID。
- `schemaVersion` 固定为 `2`，`version` 在每次保存时递增。
- `variables` 定义运行前需要用户填写的内容。
- `nodes` 只保存节点类型、版本、标题、位置与配置。
- `edges` 连接节点，保存前必须无悬空引用、自连接和环路。

变量支持 `text`、`textarea`、`number`、`boolean`、`select`、`date`、`file` 和 `folder`。在节点配置中用 `{{variable_key}}` 引用变量。敏感变量设置 `sensitive: true`，不得写入记忆值、日志或错误信息。

```ts
const variables = [
  { key: "parent_folder", label: "保存位置", type: "folder", required: true, remember: true },
  { key: "project_name", label: "项目名称", type: "text", required: true },
];
```

## 文件冲突策略

文件和目录节点必须明确冲突策略：

| 策略 | 行为 |
| --- | --- |
| `fail` | 目标存在时停止，适合保护既有内容 |
| `skip` | 保留既有目标并继续 |
| `overwrite` | 覆盖目标，只用于用户明确允许的场景 |
| `rename` | 自动生成不冲突的新名称 |

内置模板默认使用 `fail`。预览阶段应显示目标路径、冲突策略和潜在覆盖；预览函数不得创建文件、启动应用或修改任务。

## 新节点定义

节点通过 `WorkflowNodeDefinition` 注册。类型使用反向命名空间格式，例如 `my-team.export-report`。`validate` 和 `preview` 必须可重复调用且无副作用；只有 `execute` 可以实施操作。

```ts
const exportReportNode: WorkflowNodeDefinition = {
  type: "my-team.export-report",
  version: 1,
  category: "files",
  title: "导出报告",
  capabilities: ["files.write"],
  ports: [
    { id: "in", direction: "input", maxConnections: 1 },
    { id: "out", direction: "output", maxConnections: 1 },
  ],
  configSchema: {
    fields: [{ key: "path", label: "输出路径", type: "file", required: true }],
  },
  validate: (config) => typeof config.path === "string" && config.path ? [] : [
    { code: "path.required", message: "请填写输出路径", severity: "error", field: "path" },
  ],
  preview: async (config, context) => [{
    id: `${context.node.id}:report`,
    nodeId: context.node.id,
    kind: "create-file",
    title: "创建报告",
    target: String(config.path),
    conflict: "fail",
  }],
  execute: async (config, context) => {
    // 通过注入的能力适配器写入，不直接访问 Core store。
    return { status: "completed", affectedPaths: [String(config.path)] };
  },
};

const registry = createBuiltInNodeRegistry({
  additionalDefinitions: [exportReportNode],
});
```

新增字段时提升节点 `version`，并提供从旧配置到新配置的纯迁移函数。已经开始的运行始终使用快照中的节点版本；不能用当前模板覆盖运行快照。

## 权限与执行边界

节点只声明实际需要的能力。文件操作限制在用户确认的绝对路径；打开 URL 只允许 `http` 和 `https`；命令执行默认关闭，并在启用后仍需单独确认可执行程序、参数和工作目录。DailyFlow 任务节点只通过注入的 `WorkflowTaskOps` 访问任务。

运行器按“变量校验 → 影响预览 → 用户确认 → 顺序执行 → 结果记录”推进。失败重试只重置明确标记为 `retryable` 的失败步骤，已完成步骤不会再次执行。节点应尽量幂等，并把实际创建或修改的路径写入 `affectedPaths`，供运行中心展示。

## 最低验证

每个模板或节点至少验证：变量缺失、配置错误、预览无副作用、权限清单、每种冲突策略、执行成功、不可重试失败、安全重试、快照恢复和敏感值不落日志。文件类测试使用临时目录，并在结束后清理。

