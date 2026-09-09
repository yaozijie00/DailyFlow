import { Search } from "lucide-react";
import type { WorkflowLibrarySource } from "../../store/workflowUiStore";

const sources: Array<{ id: WorkflowLibrarySource; label: string }> = [
  { id: "all", label: "全部" },
  { id: "builtin", label: "内置" },
  { id: "personal", label: "我的" },
  { id: "favorite", label: "收藏" },
];

export function TemplateFilters({
  search,
  source,
  sort,
  tags,
  activeTag,
  onSearch,
  onSource,
  onSort,
  onTag,
}: {
  search: string;
  source: WorkflowLibrarySource;
  sort: "updated" | "recent" | "name";
  tags: string[];
  activeTag: string | null;
  onSearch: (value: string) => void;
  onSource: (value: WorkflowLibrarySource) => void;
  onSort: (value: "updated" | "recent" | "name") => void;
  onTag: (value: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 min-[800px]:flex-row min-[800px]:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索模板</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="搜索模板、说明或标签"
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface pl-10 pr-4 text-sm text-text-primary outline-none transition-shadow placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 text-xs text-text-muted">
          排序
          <select
            aria-label="模板排序"
            value={sort}
            onChange={(event) => onSort(event.target.value as typeof sort)}
            className="cursor-pointer bg-transparent text-sm font-medium text-text-primary outline-none"
          >
            <option value="updated">最近更新</option>
            <option value="recent">最近使用</option>
            <option value="name">名称</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border-subtle bg-surface-muted p-1" aria-label="模板来源">
          {sources.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={source === item.id}
              onClick={() => onSource(item.id)}
              className={`min-h-9 cursor-pointer rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                source === item.id ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tags.slice(0, 6).map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={activeTag === tag}
            onClick={() => onTag(activeTag === tag ? null : tag)}
            className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              activeTag === tag
                ? "border-accent/30 bg-accent-soft text-accent-strong"
                : "border-border-subtle bg-surface text-text-muted hover:border-border-strong hover:text-text-primary"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
