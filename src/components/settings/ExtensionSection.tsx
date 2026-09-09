import { useExtensionStore } from "../../stores/extensionStore";
import { useExtensionRows, type ExtensionRow } from "../../extensions/host";
import { EXTENSION_API_VERSION } from "../../extensions/types";

const CAPABILITY_LABELS = {
  "ui.page": "独立页面",
  "ui.today-slot": "今日视图",
  "ui.settings": "设置分组",
  "tasks.read": "读取任务",
  "tasks.write": "修改任务",
  "storage.core": "主库存储",
  "storage.extension": "扩展存储",
  "legacy.read": "读取旧数据",
} as const;

/**
 * 设置 → 扩展（Extension Manager）：
 * 统一入口：已安装 / 状态 / 启用禁用 / API 版本 / 错误详情。
 * Disable 不删除任何数据（Rule 03/16）。
 */
function Row({ row }: { row: ExtensionRow }) {
  const setEnabled = useExtensionStore((s) => s.setEnabled);
  return (
    <div className="rounded-md border border-border-subtle glass-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            {row.name}
            <span className="rounded bg-surface-muted px-1.5 py-px text-[10px] font-normal text-text-muted">
              v{row.version}
            </span>
            <span className="rounded bg-surface-muted px-1.5 py-px text-[10px] font-normal text-text-muted">
              API {row.apiVersion}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-text-muted">{row.description}</p>
          <p className="mt-0.5 font-mono text-[10px] text-text-faint">{row.id}</p>
          <div className="mt-2 flex flex-wrap gap-1" aria-label="扩展能力">
            {row.capabilities.length > 0 ? (
              row.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[10px] text-text-muted"
                  title={capability}
                >
                  {CAPABILITY_LABELS[capability]}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-text-faint">未申请宿主能力</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.status === "error" && (
            <span className="max-w-40 truncate text-[10px] text-red-600" title={row.error ?? ""}>
              加载失败
            </span>
          )}
          <span
            className={`text-xs ${
              row.status === "enabled"
                ? "text-green-600"
                : row.status === "error"
                  ? "text-red-500"
                  : "text-text-faint"
            }`}
          >
            {row.status === "enabled" ? "已启用" : row.status === "error" ? "异常" : "已禁用"}
          </span>
          <button
            onClick={() => void setEnabled(row.id, row.status !== "enabled")}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              row.status === "enabled"
                ? "border border-border-strong bg-surface text-text-secondary hover:bg-surface-hover"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {row.status === "enabled" ? "禁用" : "启用"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExtensionSection() {
  const rows = useExtensionRows();
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border-subtle glass-surface p-5">
        <div className="text-sm text-text-secondary">已安装的扩展</div>
        <p className="mt-0.5 text-xs text-text-faint">
          禁用只会隐藏对应功能入口，不删除任何数据；重新启用即可恢复。宿主 API 版本 v
          {EXTENSION_API_VERSION}（Extension 需声明兼容版本才会被加载）。
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-text-faint">没有已安装的扩展。</p>
      ) : (
        rows.map((r) => <Row key={r.id} row={r} />)
      )}
    </div>
  );
}
