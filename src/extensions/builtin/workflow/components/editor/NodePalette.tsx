import { GripVertical, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkflowNodeDefinition } from "../../domain/nodeDefinition";

const categoryNames: Record<string, string> = {
  flow: "流程控制",
  files: "文件系统",
  system: "系统操作",
  dailyflow: "DailyFlow",
};

export function NodePalette({ definitions, onAdd }: {
  definitions: WorkflowNodeDefinition[];
  onAdd: (type: string) => void;
}) {
  const [search, setSearch] = useState("");
  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = definitions.filter((definition) => !query || `${definition.title} ${definition.description ?? ""}`.toLowerCase().includes(query));
    const groups = new Map<string, WorkflowNodeDefinition[]>();
    for (const definition of filtered) {
      groups.set(definition.category, [...(groups.get(definition.category) ?? []), definition]);
    }
    return [...groups.entries()];
  }, [definitions, search]);
  return (
    <aside className="flex min-h-0 w-56 shrink-0 flex-col border-r border-border-subtle bg-surface max-[800px]:w-48">
      <label className="relative m-3">
        <span className="sr-only">搜索节点</span>
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点" className="min-h-10 w-full rounded-lg border border-border-subtle bg-surface-muted pl-9 pr-3 text-xs text-text-primary outline-none focus:border-accent" />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {grouped.map(([category, items]) => <section key={category} className="mb-4">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-faint">{categoryNames[category] ?? category}</h3>
          <div className="space-y-1.5">{items?.map((definition) => <button
            key={definition.type}
            type="button"
            aria-label={definition.title}
            draggable
            onDragStart={(event) => { event.dataTransfer.setData("application/x-workflow-node", definition.type); event.dataTransfer.effectAllowed = "copy"; }}
            onClick={() => onAdd(definition.type)}
            className="group flex min-h-11 w-full cursor-grab items-center gap-2 rounded-lg border border-border-subtle bg-bg-app/70 px-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <GripVertical size={13} className="shrink-0 text-text-faint" />
            <span className="min-w-0"><span className="block truncate text-xs font-medium text-text-primary">{definition.title}</span><span className="block truncate text-[10px] text-text-faint">{definition.type}</span></span>
          </button>)}</div>
        </section>)}
      </div>
    </aside>
  );
}
