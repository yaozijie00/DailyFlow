import { Copy, Trash2, X } from "lucide-react";
import type { WorkflowNodeDefinition } from "../../domain/nodeDefinition";
import type { WorkflowNodeV2 } from "../../domain/types";

const inputClass = "min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";

export function NodeInspector({ node, definition, onChange, onDuplicate, onDelete, onClose }: {
  node: WorkflowNodeV2 | null;
  definition?: WorkflowNodeDefinition;
  onChange: (node: WorkflowNodeV2) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!node || !definition) return <aside className="w-72 shrink-0 border-l border-border-subtle bg-surface p-4 text-xs leading-5 text-text-faint max-[900px]:hidden">选择一个节点以编辑属性。</aside>;
  const updateConfig = (key: string, value: unknown) => onChange({ ...node, config: { ...node.config, [key]: value } });
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border-subtle bg-surface p-4 max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-20 max-[900px]:w-[min(18rem,82%)] max-[900px]:shadow-popover">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{definition.category}</p><h3 className="mt-1 text-sm font-semibold text-text-primary">{definition.title}</h3></div>
        <div className="flex"><button type="button" aria-label="复制节点" onClick={onDuplicate} className="grid size-9 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover"><Copy size={14} /></button><button type="button" aria-label="删除节点" onClick={onDelete} className="grid size-9 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button><button type="button" aria-label="关闭属性面板" onClick={onClose} className="grid size-9 cursor-pointer place-items-center rounded-lg text-text-muted hover:bg-surface-hover min-[901px]:hidden"><X size={14} /></button></div>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block text-xs text-text-muted">节点标题<input aria-label="节点标题" value={node.title} onChange={(event) => onChange({ ...node, title: event.target.value })} className={`${inputClass} mt-1.5`} /></label>
        {definition.configSchema.fields.map((field) => <label key={field.key} className="block text-xs text-text-muted">{field.label}
          {field.type === "boolean" ? <input aria-label={field.label} type="checkbox" checked={node.config[field.key] === true} onChange={(event) => updateConfig(field.key, event.target.checked)} className="ml-3 size-4 accent-[var(--color-accent)]" /> : field.type === "textarea" || field.type === "string-list" || field.type === "directory-tree" ? <textarea aria-label={field.label} rows={field.type === "textarea" ? 4 : 5} value={Array.isArray(node.config[field.key]) ? (node.config[field.key] as unknown[]).join("\n") : String(node.config[field.key] ?? "")} onChange={(event) => updateConfig(field.key, field.type === "textarea" ? event.target.value : event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))} className={`${inputClass} mt-1.5 resize-y py-2`} /> : field.type === "select" ? <select aria-label={field.label} value={String(node.config[field.key] ?? field.defaultValue ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)} className={`${inputClass} mt-1.5`}>{(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input aria-label={field.label} type={field.type === "number" ? "number" : "text"} value={String(node.config[field.key] ?? "")} onChange={(event) => updateConfig(field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} className={`${inputClass} mt-1.5`} />}
          {field.description && <span className="mt-1 block text-[10px] leading-4 text-text-faint">{field.description}</span>}
        </label>)}
      </div>
    </aside>
  );
}
