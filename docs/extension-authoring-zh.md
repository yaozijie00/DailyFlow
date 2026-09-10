# DailyFlow 扩展开发约定

DailyFlow 的扩展是随应用编译的可信 TypeScript 模块。扩展通过版本化的 `CoreContext` 使用核心能力，通过贡献对象添加页面和槽位。它不是运行任意第三方代码的安全沙箱；如果未来开放外部安装，需要另行设计签名、权限、进程隔离和升级回滚。

## 目录与入口

内置扩展放在 `src/extensions/builtin/<extension-name>/`，入口固定为 `index.ts`。宿主使用 `import.meta.glob` 发现入口，核心页面不应直接导入某个扩展实现。

```ts
import { EXTENSION_API_VERSION, type CoreContext, type ExtensionManifest } from "../../types";
import ExtensionPage from "./Page";
import ExtensionSettings from "./Settings";

export const manifest = {
  id: "com.example.my-extension",
  name: "示例扩展",
  description: "一句话说明用户价值",
  version: "0.1.0",
  apiVersion: EXTENSION_API_VERSION,
  capabilities: ["ui.page", "ui.settings", "tasks.read"],
} satisfies ExtensionManifest;

export async function init(ctx: CoreContext): Promise<void> {
  if (!ctx.storage) throw new Error("扩展存储能力未授权");
  await ctx.storage.migrate(2, [
    {
      version: 1,
      migrate: (storage) => storage.set("preferences", { compact: false }),
    },
    {
      version: 2,
      migrate: async (storage) => {
        const oldValue = await storage.get<{ compact: boolean }>("preferences");
        await storage.set("preferences", { ...oldValue, accent: "sage" });
      },
    },
  ]);
}

export function activate(ctx: CoreContext) {
  ctx.events.subscribe("task", () => {
    // 重新读取扩展所需的派生数据。
  });
  // events.subscribe 已自动纳入当前生命周期。其它资源显式登记：
  const timer = window.setInterval(() => {}, 60_000);
  ctx.lifecycle.onDispose(() => window.clearInterval(timer));

  return {
    nav: { page: "ext:my-extension", label: "示例" },
    Page: ExtensionPage,
    settings: [
      { id: "general", label: "常规", Component: ExtensionSettings },
    ],
  };
}

export async function deactivate(_ctx: CoreContext): Promise<void> {
  // 关闭数据库、worker 等外部资源。该函数必须可重复调用。
}
```

## 边界规则

- `manifest.id` 使用小写反向域名并保持永久稳定，段内可用连字符，例如 `com.example.focus-review`。重复或格式错误的 ID 会被拒绝并记录诊断。
- `manifest.version` 遵循 SemVer 2.0，例如 `1.4.0` 或 `2.0.0-beta.1`；`apiVersion` 必须是正整数。API 版本与当前宿主不一致时，扩展不会加载，并会记录所需版本和宿主版本。
- 页面路由必须以 `ext:` 开头；`nav` 与 `Page` 必须同时提供。重复路由只会让冲突扩展进入错误状态，不影响核心应用。
- 设置分组 `id` 在本扩展内保持稳定且唯一。宿主会用扩展 ID 自动建立全局命名空间，并为每个设置组件提供独立错误边界。
- `init`、`activate`、`deactivate` 按单个扩展串行执行。启用、禁用和重试不会交叉运行。
- 监听器、定时器和外部句柄注册到 `ctx.lifecycle.onDispose`。激活失败、停用和重试都会清理这些资源。
- 任务写入只走 `ctx.tasks`。扩展不导入 Zustand store、Repository 或核心数据库表。
- 设置、缓存索引和中小型 JSON 数据优先使用 `ctx.storage`；大型关系数据可放入扩展自己的 SQLite 文件，并提供幂等迁移。需要参与应用备份的独立库必须注册备份参与者。
- React 页面和槽位仍要自带局部错误处理；宿主的错误边界会阻止扩展渲染错误拖垮核心页面。

## 能力声明

Manifest 必须列出扩展实际使用的能力。旧扩展省略 `capabilities` 时按空数组加载，但任何受控宿主 API 调用或 UI 贡献都会被拒绝。

| 能力 | 允许的操作 |
| --- | --- |
| `ui.page` | 贡献独立导航与页面 |
| `ui.today-slot` | 在今日页标准槽位渲染组件 |
| `ui.task-action` | 在任务详情中贡献动作；只接收任务 id、标题和状态 |
| `ui.settings` | 贡献独立设置分组 |
| `tasks.read` | 通过 `ctx.tasks` 查询任务 |
| `tasks.write` | 通过 `ctx.tasks` 创建或完成任务 |
| `legacy.read` | 读取只读旧版课程迁移数据 |
| `storage.extension` | 使用宿主绑定 manifest ID 的 JSON 键值存储与版本迁移 |
| `storage.core` | 声明使用随主程序迁移的核心库存储 |

宿主会在运行时限制任务读写、扩展存储、旧数据读取和 UI 贡献。`storage.core` 当前仍用于管理页审计；内置扩展与主程序共同编译，因此这套能力系统不是恶意代码安全沙箱。开放外部安装前仍需增加签名、进程隔离和文件系统权限控制。

### 快捷启动与任务动作

`quickLaunch` 使用 `ui.today-slot` 能力在今日页提供轻量入口。`taskActions` 需要 `ui.task-action`，组件只接收 `{ id, title, status }`，不得导入任务 Store。宿主在扩展禁用、激活失败或渲染异常时自动隐藏并隔离入口。

Workflow 节点实现 `WorkflowNodeDefinition`，再通过 `createBuiltInNodeRegistry({ additionalDefinitions })` 注册。节点必须声明能力，并保持 `validate`、`preview` 无副作用。变量、冲突策略、重试和日志要求见 [Workflow 模板与节点开发指南](./workflow-authoring-zh.md)。

## 数据变化与状态

`ctx.events` 提供数据域版本订阅。当前域包括 `task`、`focus`、`note`、`goal`、`project`、`course`、`settings`。事件表示“旧数据已失效”，扩展收到事件后应重新查询，不应假设事件携带完整实体。

扩展设置使用 `ext.<manifest.id>.*` 命名空间。扩展专属表、文件和日志也应使用稳定 ID 或稳定短名，避免与核心资源冲突。

### 宿主管理的扩展存储

声明 `storage.extension` 后，宿主会注入 `ctx.storage`。键只能包含字母、数字、点、下划线与连字符，长度不超过 128；值必须是 JSON 值。命名空间由宿主绑定，两个扩展使用相同键也不会互相覆盖。禁用扩展不会删除数据，主库备份会自动覆盖这些数据。

```ts
await ctx.storage?.set("filters.v1", { status: ["TODO"] });
const filters = await ctx.storage?.get<{ status: string[] }>("filters.v1");
const keys = await ctx.storage?.keys();
await ctx.storage?.delete("cache.last-result");
```

迁移版本从 `1` 连续递增。每一步成功后宿主才会保存新版本；失败的步骤会在扩展下次激活时重试。底层数据库适配器不保证跨连接事务，因此迁移函数应使用覆盖写入、存在性检查等幂等操作。若已安装数据版本高于当前扩展支持版本，宿主会拒绝降级，防止旧代码破坏新格式。

## API 演进

当前 `EXTENSION_API_VERSION` 为 1。同一主版本内只增加可兼容能力，不改变已有字段语义。出现无法兼容的上下文或生命周期变化时：

1. 增加 API 版本；
2. 宿主保留旧版本适配层；
3. 扩展更新 manifest 并完成迁移；
4. 删除适配层前先提供至少一个完整发布周期的迁移窗口。

## 最低验证

每个扩展至少覆盖：manifest 校验、首次初始化、重复初始化、启用/禁用、激活失败后的资源清理、路由或槽位渲染错误隔离、数据迁移、备份恢复（拥有独立库时）。涉及核心任务写入时，还要覆盖失败返回值，禁止在持久化失败后显示成功状态。
