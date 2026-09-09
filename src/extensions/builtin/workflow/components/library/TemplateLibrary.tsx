import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Library, RefreshCw } from "lucide-react";
import { workflowService } from "../../services/workflowService";
import type { WorkflowTemplate, WorkflowTemplateQuery } from "../../templates/templateService";
import { useWorkflowUiStore } from "../../store/workflowUiStore";
import { TemplateCard } from "./TemplateCard";
import { TemplateFilters } from "./TemplateFilters";

type TemplateServiceApi = Pick<
  typeof workflowService,
  "listTemplates" | "duplicateTemplateForEdit" | "setTemplateFavorite" | "markTemplateUsed"
>;

export function TemplateLibrary({
  service = workflowService,
  onRun,
  onEdit,
}: {
  service?: TemplateServiceApi;
  onRun: (template: WorkflowTemplate) => void;
  onEdit: (template: WorkflowTemplate) => void;
}) {
  const search = useWorkflowUiStore((state) => state.search);
  const source = useWorkflowUiStore((state) => state.source);
  const activeTag = useWorkflowUiStore((state) => state.tag);
  const setSearch = useWorkflowUiStore((state) => state.setSearch);
  const setSource = useWorkflowUiStore((state) => state.setSource);
  const setTag = useWorkflowUiStore((state) => state.setTag);
  const [sort, setSort] = useState<"updated" | "recent" | "name">("updated");
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query: WorkflowTemplateQuery = {
      search,
      sort,
      ...(source === "favorite" ? { source: "all", favorite: true } : { source }),
      ...(activeTag ? { tag: activeTag } : {}),
    };
    try {
      setTemplates(await service.listTemplates(query));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "模板加载失败");
    } finally {
      setLoading(false);
    }
  }, [activeTag, search, service, sort, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const tags = useMemo(
    () => [...new Set(templates.flatMap((template) => template.tags))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [templates],
  );

  const run = async (template: WorkflowTemplate) => {
    await service.markTemplateUsed(template.id);
    onRun(template);
    await load();
  };

  const edit = async (template: WorkflowTemplate) => {
    onEdit(template.source === "builtin" ? await service.duplicateTemplateForEdit(template.id) : template);
  };

  const copy = async (template: WorkflowTemplate) => {
    await service.duplicateTemplateForEdit(template.id);
    await load();
  };

  const favorite = async (template: WorkflowTemplate) => {
    await service.setTemplateFavorite(template.id, !template.favorite);
    await load();
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-strong">Automation library</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-text-primary">从一个可靠模板开始</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">填写少量变量，先预览将要发生的操作，再决定是否执行。</p>
        </div>
        {!loading && !error && <span className="text-xs text-text-muted">{templates.length} 个模板</span>}
      </div>
      <TemplateFilters
        search={search}
        source={source}
        sort={sort}
        tags={tags}
        activeTag={activeTag}
        onSearch={setSearch}
        onSource={setSource}
        onSort={setSort}
        onTag={setTag}
      />

      {loading ? (
        <div aria-label="正在加载模板" className="mt-6 grid grid-cols-1 gap-4 min-[800px]:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-border-subtle bg-surface-muted" />)}
        </div>
      ) : error ? (
        <div role="alert" className="mt-6 grid min-h-56 place-items-center rounded-2xl border border-danger/20 bg-danger-soft p-6 text-center">
          <div>
            <AlertCircle className="mx-auto text-danger" size={24} />
            <p className="mt-3 text-sm font-medium text-text-primary">模板暂时无法加载</p>
            <p className="mt-1 text-xs text-text-muted">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 text-sm text-text-secondary hover:bg-surface-hover">
              <RefreshCw size={14} /> 重试
            </button>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="mt-6 grid min-h-56 place-items-center rounded-2xl border border-dashed border-border-strong bg-surface/60 p-6 text-center">
          <div>
            <Library className="mx-auto text-text-faint" size={26} />
            <p className="mt-3 text-sm font-medium text-text-primary">没有匹配的模板</p>
            <button type="button" onClick={() => { setSearch(""); setSource("all"); setTag(null); }} className="mt-3 min-h-10 cursor-pointer rounded-lg px-3 text-sm text-accent-strong hover:bg-accent-soft">清除筛选</button>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 min-[800px]:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onRun={() => void run(template)}
              onEdit={() => void edit(template)}
              onCopy={() => void copy(template)}
              onFavorite={() => void favorite(template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
