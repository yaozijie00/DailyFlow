import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getDb } from "../../db/db";
import { PlanningWorkspaceService, type PlanningItem } from "../../services/planningWorkspaceService";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useDataVersion } from "../../lib/dataVersion";
import { addDays, weekOf } from "../../lib/planningDates";
import { PageHeader } from "../ui/PageHeader";
import PlanningDetail from "./PlanningDetail";
import PlanningReview from "./PlanningReview";
import { duration, Field, lifecycleLabels, Tabs, useAction } from "./planningUi";
import "./planning.css";

export const planningWorkspaceService = new PlanningWorkspaceService(getDb());
import { useSearchNavigationStore } from "../../stores/searchNavigationStore";

const lifecycleOrder = ["active", "ready", "preparation", "not_started", "idea", "paused", "completed", "archived"];
const groupOf = (item: PlanningItem) => item.archivedAt ? "archived" : item.lifecycle;
export default function PlanningWorkspace({ service = planningWorkspaceService, onOpenPlan }: { service?: PlanningWorkspaceService; onOpenPlan?: (id: number) => void }) {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const capacity = useSettingsStore((s) => s.settings.longTermWeeklyCapacityMinutes);
  const updateSettings = useSettingsStore((s) => s.update);
  const goalVersion = useDataVersion("goal"), projectVersion = useDataVersion("project"), taskVersion = useDataVersion("task"), focusVersion = useDataVersion("focus");
  const [tab, setTab] = useState<"工作台" | "全部事项" | "复盘">("工作台");
  const [week, setWeek] = useState(weekOf()), [items, setItems] = useState<PlanningItem[]>([]), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string | null>(null), [search, setSearch] = useState(""), [kind, setKind] = useState("all"), [state, setState] = useState("all");
  const [creating, setCreating] = useState(false), [title, setTitle] = useState(""), [newKind, setNewKind] = useState<"plan" | "project">("plan"), [idea, setIdea] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState(String(capacity / 60)), [editingCapacity, setEditingCapacity] = useState(false);
  const action = useAction(), request = useRef(0), detailAnchor = useRef<HTMLElement>(null);
  const reload = useCallback(async () => {
    const id = ++request.current;
    try { const rows = await service.list(week); if (id === request.current) { setItems(rows); setLoadError(""); } }
    catch (error) { if (id === request.current) setLoadError(error instanceof Error ? error.message : "加载失败"); }
    finally { if (id === request.current) setLoading(false); }
  }, [service, week]);
  useEffect(() => { if (dbStatus === "ready") void reload(); return () => { request.current++; }; }, [dbStatus, reload, goalVersion, projectVersion, taskVersion, focusVersion]);
  const goalRequest = useSearchNavigationStore((s) => s.goalRequest);
  useEffect(() => {
    if (!goalRequest || loading) return;
    const found = items.find((item) => item.kind === "plan" && item.id === goalRequest.id);
    if (!found) return;
    setTab("全部事项"); setSearch(""); setKind("all"); setState("all"); setSelected(found.key);
    useSearchNavigationStore.getState().clearGoalRequest(goalRequest.token);
    const timer = window.setTimeout(() => { detailAnchor.current?.scrollIntoView?.({ block: "nearest" }); detailAnchor.current?.focus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [goalRequest, items, loading]);
  const current = items.find((item) => item.key === selected);
  const visible = items.filter((item) => (tab !== "工作台" || (!item.archivedAt && !["completed", "archived"].includes(item.lifecycle)))
    && (!search.trim() || `${item.title} ${item.nextAction ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    && (kind === "all" || item.kind === kind) && (state === "all" || (state === "archived" ? !!item.archivedAt || item.lifecycle === "archived" : !item.archivedAt && item.lifecycle === state)))
    .sort((a, b) => lifecycleOrder.indexOf(groupOf(a)) - lifecycleOrder.indexOf(groupOf(b)) || a.priority.localeCompare(b.priority) || a.sortOrder - b.sortOrder || a.id - b.id);
  const committed = items.reduce((sum, item) => sum + (item.week?.targetMinutes ?? 0), 0), actual = items.reduce((sum, item) => sum + item.actualMinutes, 0);
  const pressure = capacity > 0 ? committed / capacity : committed > 0 ? Infinity : 0;
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await action.run(async () => { const key = await service.create(newKind, title, idea); await reload(); setTitle(""); setIdea(false); setCreating(false); setSelected(key); }, "事项已创建");
  };
  const openItem = (key: string) => { setSelected(key); window.setTimeout(() => detailAnchor.current?.focus(), 0); };
  return <div className="df-page-wide pw-workspace">
    <PageHeader title="长期计划" description="让长期方向，落在这一周的行动里。" actions={<button className="pw-primary" onClick={() => setCreating(!creating)}>{creating ? "收起新建" : "新建事项"}</button>} />
    <Tabs label="长期计划视图" value={tab} options={["工作台", "全部事项", "复盘"]} onChange={(value) => { setTab(value); if (value === "工作台" && ["completed", "archived"].includes(state)) setState("all"); }} />
    {action.message}
    {creating && <form className="pw-panel pw-create" onSubmit={create}>
      <Field label="事项名称"><input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="想推进什么？" /></Field>
      <Field label="事项类型"><select value={newKind} onChange={(e) => setNewKind(e.target.value as "plan" | "project")}><option value="plan">长期计划</option><option value="project">项目</option></select></Field>
      <label className="pw-check"><input type="checkbox" checked={idea} onChange={(e) => setIdea(e.target.checked)} />先收进想法箱</label>
      <button className="pw-primary" disabled={action.busy || !title.trim()}>创建事项</button>
    </form>}
    {dbStatus !== "ready" ? <p role="status">{dbStatus === "error" ? "数据库连接失败，请在设置中检查。" : "正在连接数据…"}</p> : <>
      {loadError && <p role="alert" className="pw-error">{loadError} <button onClick={() => void reload()}>重试加载</button></p>}
      {tab === "复盘" ? <PlanningReview service={service} items={items} refreshKey={`${goalVersion}:${projectVersion}:${taskVersion}:${focusVersion}`} /> : <>
        <section className="pw-capacity" aria-label="本周长期投入">
          <div className="pw-toolbar"><div><h2>本周长期投入</h2><p className="pw-muted">已承诺 {duration(committed)} · 实际 {duration(actual)} · 容量 {duration(capacity)}</p></div>
            <div className="pw-inline"><button aria-label="上一周" onClick={() => setWeek(addDays(week, -7))}>←</button><span>{week} — {addDays(week, 6).slice(5)}</span><button aria-label="下一周" onClick={() => setWeek(addDays(week, 7))}>→</button>{week !== weekOf() && <button onClick={() => setWeek(weekOf())}>本周</button>}<button onClick={() => { setCapacityDraft(String(capacity / 60)); setEditingCapacity(!editingCapacity); }}>调整容量</button></div>
          </div>
          <progress aria-label="本周容量占用" value={Math.min(committed, Math.max(capacity, 1))} max={Math.max(capacity, 1)} />
          {pressure > 1 ? <p className="pw-warning">超出容量 {duration(committed - capacity)}。打开事项，减少本周承诺或选择任务改期。</p> : pressure >= .85 ? <p className="pw-warning">已接近容量，建议保留一些余量。</p> : <p className="pw-muted">{committed ? `还可承诺 ${duration(Math.max(0, capacity - committed))}` : "尚未承诺本周投入。每周默认投入不会自动占用容量。"}</p>}
          {editingCapacity && <form className="pw-inline" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { if (!await updateSettings({ longTermWeeklyCapacityMinutes: Math.round(Number(capacityDraft) * 60) })) throw new Error("容量未保存，请重试"); setEditingCapacity(false); }); }}><Field label="每周容量（小时）"><input type="number" min="0" max="168" step="0.25" required value={capacityDraft} onChange={(e) => setCapacityDraft(e.target.value)} /></Field><button disabled={action.busy}>保存容量</button></form>}
        </section>
        <div className={`pw-columns ${current ? "pw-has-detail" : ""}`}>
          <section className="pw-list" aria-label="长期事项列表">
            <div className="pw-filters"><input aria-label="搜索事项" placeholder="搜索名称或下一步" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="类型筛选" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">所有类型</option><option value="plan">长期计划</option><option value="project">项目</option></select><select aria-label="状态筛选" value={state} onChange={(e) => setState(e.target.value)}><option value="all">所有状态</option>{Object.entries(lifecycleLabels).filter(([key]) => tab === "全部事项" || !["completed", "archived"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div className="pw-row-head" aria-hidden="true"><span>事项 / 下一步</span><span>成果进度</span><span>本周实际 / 承诺</span></div>
            {loading ? <p role="status" className="pw-empty">正在整理事项…</p> : visible.length ? visible.map((item, index) => <Fragment key={item.key}>{(index === 0 || groupOf(visible[index - 1]) !== groupOf(item)) && <h3 className="pw-muted" style={{ padding: "16px 12px 8px" }}>{lifecycleLabels[groupOf(item)]}</h3>}<button className="pw-item-row" aria-pressed={selected === item.key} onClick={() => openItem(item.key)}>
              <span className="pw-item-title"><strong>{item.title}</strong><span className="pw-item-meta">{item.kind === "plan" ? "计划" : "项目"} · {item.archivedAt ? "已归档" : lifecycleLabels[item.lifecycle]} · {item.priority.toUpperCase()}{item.plan?.currentPhaseTitle ? ` · ${item.plan.currentPhaseTitle}` : ""}</span><span className="pw-next">{item.nextAction ?? "添加一个下一步行动"}</span></span>
              <span className="pw-row-progress">{item.progress != null && <progress aria-label={`${item.title}成果进度`} value={item.progress} max={100} />}<span>{item.progressLabel}</span>{!!item.health?.length && <span className="pw-muted" title={item.health.map((reason) => reason.detail).join(" ")}>{item.health.map((reason) => reason.label).join(" · ")}</span>}</span>
              <span className="pw-row-time">{duration(item.actualMinutes)} / {item.week ? duration(item.week.targetMinutes) : "未承诺"}</span>
            </button></Fragment>) : <div className="pw-empty"><h3>{search || state !== "all" || kind !== "all" ? "没有匹配的事项" : "给长期方向一个位置"}</h3><p>从一个计划、项目或尚未成形的想法开始。</p><button onClick={() => setCreating(true)}>新建第一个事项</button></div>}
          </section>
          {current && <section ref={detailAnchor} tabIndex={-1} className="pw-detail" aria-label={`${current.title}详情`}><PlanningDetail key={current.key} item={current} week={week} service={service} onChanged={reload} onClose={() => setSelected(null)} onOpenPlan={onOpenPlan} /></section>}
        </div>
      </>}
    </>}
  </div>;
}
