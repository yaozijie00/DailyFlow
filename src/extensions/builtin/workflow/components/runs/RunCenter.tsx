import { useCallback, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import type { WorkflowRunState } from "../../models";
import { workflowRunnerV2Host } from "../../runnerHost";
import type { WorkflowRunDetailV2 } from "../../services/workflowRunnerV2";
import { workflowService, type WorkflowRunDetail } from "../../services/workflowService";
import { workflowSystemBridge } from "../../systemBridge";
import { RunDetail } from "./RunDetail";
import { RunList } from "./RunList";

type Filter = "all" | "running" | "awaiting-confirm" | "failed" | "completed";
const filters: Array<{ id: Filter; label: string; states?: WorkflowRunState[] }> = [
  { id: "all", label: "全部" },
  { id: "running", label: "运行中", states: ["pending", "running", "paused"] },
  { id: "awaiting-confirm", label: "等待确认", states: ["awaiting-confirm"] },
  { id: "failed", label: "失败", states: ["failed"] },
  { id: "completed", label: "完成", states: ["completed"] },
];

export interface RunCenterDataSource {
  listRunDetails(query: { states?: WorkflowRunState[]; cursor?: string; limit?: number }): Promise<{ items: WorkflowRunDetail[]; nextCursor: string | null }>;
}
export interface RunCenterRunner {
  retry(id: string): Promise<WorkflowRunDetailV2>;
  resume(id: string): Promise<WorkflowRunDetailV2>;
  confirmFinish(id: string): Promise<WorkflowRunDetailV2>;
  cancel(id: string): Promise<WorkflowRunDetailV2>;
}

export function RunCenter({ dataSource = workflowService, runner = workflowRunnerV2Host, onOpenTarget = (path) => workflowSystemBridge.openFolder(path) }: {
  dataSource?: RunCenterDataSource;
  runner?: RunCenterRunner;
  onOpenTarget?: (path: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<WorkflowRunDetail[]>([]);
  const [selected, setSelected] = useState<WorkflowRunDetail | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    try {
      const states = filters.find((item) => item.id === filter)?.states;
      const page = await dataSource.listRunDetails({ ...(states ? { states } : {}), ...(append && cursor ? { cursor } : {}), limit: 30 });
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.nextCursor);
      if (!append) setSelected((current) => page.items.find((item) => item.run.id === current?.run.id) ?? page.items[0] ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载运行记录失败");
    } finally {
      setLoading(false);
    }
  }, [cursor, dataSource, filter]);

  useEffect(() => { void load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, dataSource]);

  const act = async (action: "retry" | "resume" | "confirmFinish" | "cancel") => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const next = await runner[action](selected.run.id);
      const detail = { ...selected, run: next.run, steps: next.steps };
      setSelected(detail);
      setItems((current) => current.map((item) => item.run.id === detail.run.id ? detail : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return <div className="rounded-2xl border border-border-subtle bg-surface/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-base font-semibold text-text-primary">运行中心</h2><p className="mt-1 text-sm text-text-muted">查看每次自动化的真实执行过程，并继续需要处理的运行。</p></div>
      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-text-muted">{items.length} 条记录</span>
    </div>
    <div role="tablist" aria-label="运行状态筛选" className="mt-4 flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
      {filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => { setCursor(null); setFilter(item.id); }} className={`min-h-10 rounded-lg px-3 text-xs ${filter === item.id ? "bg-surface font-medium text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}>{item.label}</button>)}
    </div>
    {error && !selected && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    {loading && items.length === 0 ? <p className="py-16 text-center text-sm text-text-muted">正在读取运行记录…</p> : items.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><ListChecks className="mx-auto text-text-faint" size={30} /><h3 className="mt-3 text-sm font-semibold text-text-primary">暂无运行记录</h3><p className="mt-1 text-sm text-text-muted">从模板库运行一次自动化后，这里会保留执行过程。</p></div></div> : <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"><div className="min-w-0"><RunList items={items} selectedId={selected?.run.id ?? null} onSelect={setSelected} />{cursor && <button type="button" disabled={loading} onClick={() => void load(true)} className="mt-3 min-h-10 w-full rounded-lg border border-border-strong text-sm text-text-secondary hover:bg-surface-hover">{loading ? "加载中…" : "加载更多"}</button>}</div><RunDetail detail={selected} busy={busy} error={error} onRetry={() => void act("retry")} onResume={() => void act("resume")} onConfirm={() => void act("confirmFinish")} onCancel={() => void act("cancel")} onOpenTarget={(path) => void onOpenTarget(path)} /></div>}
  </div>;
}

