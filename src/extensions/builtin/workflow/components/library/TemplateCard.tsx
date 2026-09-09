import { FolderTree, MoreHorizontal, Pencil, Play, Rocket, Star, Workflow } from "lucide-react";
import type { WorkflowTemplate } from "../../templates/templateService";

function capabilityLabels(template: WorkflowTemplate): string[] {
  const labels = new Set<string>();
  for (const node of template.nodes) {
    if (node.type.startsWith("files.")) labels.add("文件写入");
    if (node.type.startsWith("system.open")) labels.add("打开资源");
    if (node.type === "system.launch-app") labels.add("启动应用");
    if (node.type === "system.execute-process") labels.add("执行命令");
    if (node.type.startsWith("dailyflow.")) labels.add("任务变更");
  }
  return [...labels];
}

export function TemplateCard({
  template,
  onRun,
  onEdit,
  onCopy,
  onFavorite,
}: {
  template: WorkflowTemplate;
  onRun: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onFavorite: () => void;
}) {
  const stepCount = template.nodes.filter((node) => !["core.start", "core.finish"].includes(node.type)).length;
  const capabilities = capabilityLabels(template);
  const isLaunchTemplate = template.nodes.some((node) => node.type.startsWith("system."));
  const FeatureIcon = isLaunchTemplate ? Rocket : FolderTree;

  return (
    <article className="group flex min-h-64 flex-col rounded-2xl border border-border-subtle bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_16px_38px_-28px_rgba(15,23,42,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-xl border border-border-subtle bg-surface-muted text-text-secondary">
          <FeatureIcon size={18} strokeWidth={1.7} />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`${template.favorite ? "取消收藏" : "收藏"} ${template.name}`}
            onClick={onFavorite}
            className={`grid size-10 cursor-pointer place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${template.favorite ? "bg-warning-soft text-warning" : "text-text-faint hover:bg-surface-hover hover:text-text-primary"}`}
          >
            <Star size={16} fill={template.favorite ? "currentColor" : "none"} />
          </button>
          <details className="relative">
            <summary aria-label={`更多操作 ${template.name}`} className="grid size-10 cursor-pointer list-none place-items-center rounded-lg text-text-faint transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <MoreHorizontal size={18} />
            </summary>
            <div className="absolute right-0 top-11 z-20 w-36 rounded-xl border border-border-subtle bg-bg-elevated p-1.5 shadow-popover">
              <button type="button" onClick={onEdit} className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-xs text-text-secondary hover:bg-surface-hover">
                <Pencil size={13} /> 编辑
              </button>
              <button type="button" onClick={onCopy} className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-xs text-text-secondary hover:bg-surface-hover">
                <Workflow size={13} /> 创建副本
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-1 text-[15px] font-semibold tracking-[-0.01em] text-text-primary">{template.name}</h3>
          {template.source === "builtin" && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">内置</span>}
        </div>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-text-muted">{template.description || "暂无说明"}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {template.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-md bg-surface-muted px-2 py-1 text-[10px] text-text-muted">{tag}</span>)}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-text-muted">
        <span>{stepCount} 个步骤</span>
        <span>{capabilities.length ? capabilities.slice(0, 2).join(" · ") : "无需额外能力"}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate text-[11px] text-text-faint">{template.lastUsedAt ? "最近使用过" : "尚未运行"}</span>
        <button
          type="button"
          onClick={onRun}
          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Play size={14} fill="currentColor" /> 运行
        </button>
      </div>
    </article>
  );
}
