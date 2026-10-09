import { useEffect, useState, type MouseEvent, type CSSProperties } from "react";
import { getDb } from "../../db/db";
import type { PlanningItem } from "../../services/planningWorkspaceService";
import { GanttService, type TaskRange, type Milestone } from "../../services/ganttService";
import type { PhaseWithProgress } from "../../db/repositories/longTermPlanRepository";
import type { Task } from "../../db/repositories/taskRepository";
import { useDataVersion } from "../../lib/dataVersion";
import { addDays, weekOf } from "../../lib/planningDates";
import { todayString } from "../../lib/date";
import { isLocalDate } from "../../services/taskSchedulingService";
import { progressFromEstimatedMinutes } from "../../lib/longTermPlan";
import { dayDistance, shiftSpan, summarySpan, taskSpan, type DateSpan } from "../../lib/gantt";
import { executionDescendants, executionLeaves, executionRoots } from "../../lib/taskExecution";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { Dialog } from "../ui/Dialog";
import TaskDetail from "../tasks/TaskDetail";
import "./gantt.css";

const service = new GanttService(getDb());
type Row = { key: string; title: string; level: number; span: DateSpan | null; task?: Task; milestone?: Milestone; expandable?: boolean; summary?: boolean; progress?: number | null; hint?: string };
type DateEdit = { id: number; title: string; startDay: string; endDay: string; expected: TaskRange | null };
export default function PlanningGantt({ items }: { items: PlanningItem[] }) {
  const version = useDataVersion("task"), goalVersion = useDataVersion("goal"), projectVersion = useDataVersion("project");
  const [ranges, setRanges] = useState<TaskRange[]>([]), [milestones, setMilestones] = useState<Milestone[]>([]), [phases, setPhases] = useState<PhaseWithProgress[]>([]);
  const [start, setStart] = useState(weekOf()), [days, setDays] = useState(28), [closed, setClosed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null), [edit, setEdit] = useState<DateEdit | null>(null), [preview, setPreview] = useState<{ id: number; span: DateSpan } | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [newMilestone, setNewMilestone] = useState(false), [name, setName] = useState(""), [owner, setOwner] = useState(""), [date, setDate] = useState(todayString());
  const [editingMilestone,setEditingMilestone] = useState<Milestone | null>(null);
  const [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const drag = useWindowDrag(), cell = days === 28 ? 32 : 18;
  useEffect(() => { let alive = true; void Promise.all([service.ranges(), service.milestones(), Promise.all(items.filter((i) => i.kind === "plan").map((i) => service.phases(i.id)))]).then(([r,m,p]) => { if (alive) { setRanges(r); setMilestones(m); setPhases(p.flat()); setError(""); } }).catch(() => { if (alive) setError("甘特数据读取失败，请重试"); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [items, version, goalVersion, projectVersion, retry]);
  const toggle = (key: string) => setClosed((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const spanOf = (task: Task) => preview?.id === task.id ? preview.span : taskSpan(task, ranges);
  const rows: Row[] = [];
  for (const item of items.filter((i) => !i.archivedAt && i.lifecycle !== "archived")) {
    const tasks = item.tasks.filter((t) => t.status !== "CANCELLED");
    const roots = executionRoots(tasks);
    const leaves = executionLeaves(tasks), span = summarySpan(leaves.map(spanOf)) ?? (item.plan?.startDate && item.targetDate && isLocalDate(item.plan.startDate) && isLocalDate(item.targetDate) && item.plan.startDate<=item.targetDate ? { startDay: item.plan.startDate, endDay: item.targetDate } : null);
    rows.push({ key:item.key, title:item.title, level:0, span, expandable:true, summary:true, progress:item.progress, hint:item.kind === "plan" ? "计划" : "项目" });
    if (closed.has(item.key)) continue;
    const addTasks = (group: Task[], level: number) => {
      const add = (task: Task, depth: number, seen: Set<number>) => {
        if (seen.has(task.id)) return; const next = new Set(seen).add(task.id);
        const children = tasks.filter((t) => t.parentId === task.id), key = `task:${task.id}`;
        rows.push({ key, title:task.title, level:depth, span:children.length ? summarySpan(executionLeaves(executionDescendants(tasks,task.id)).map(spanOf)) : spanOf(task), task, expandable:!!children.length, summary:!!children.length, hint:task.status === "COMPLETED" ? "已完成" : children.length ? "汇总" : ranges.some((r) => r.taskId === task.id) ? "多日范围" : task.scheduledDate ? "日安排" : "未排期" });
        if (!closed.has(key)) children.forEach((c) => add(c, depth+1, next));
      };
      group.forEach((t) => add(t, level, new Set()));
    };
    if (item.kind === "plan") {
      for (const phase of phases.filter((p) => p.goalId === item.id)) {
        const phaseRoots = roots.filter((t) => t.phaseId === phase.id), phaseTasks = phaseRoots.flatMap((t) => [t,...executionDescendants(tasks,t.id)]), key = `phase:${phase.id}`;
        const phaseLeaves = executionLeaves(phaseTasks);
        const progress = phase.manualProgress ?? (phaseLeaves.length ? progressFromEstimatedMinutes(phaseLeaves.map((t) => ({ status:t.status,estimatedMinutes:t.estimatedDuration == null ? null : t.estimatedDuration/60 }))) : null);
        rows.push({ key, title:phase.title, level:1, span:summarySpan(phaseLeaves.map(spanOf)), expandable:true, summary:true, progress, hint:"阶段" });
        if (!closed.has(key)) addTasks(phaseRoots, 2);
      }
      addTasks(roots.filter((t) => !phases.some((p) => p.id === t.phaseId && p.goalId === item.id)), 1);
    } else addTasks(roots, 1);
    milestones.filter((m) => item.kind === "plan" ? m.goalId === item.id : m.projectId === item.id).forEach((m) => rows.push({ key:`milestone:${m.id}`, title:m.title, level:1, span:{ startDay:m.targetDay, endDay:m.targetDay }, milestone:m, hint:m.completed ? "节点已完成" : "里程碑" }));
  }
  const dateEditor = (task: Task, span = spanOf(task)) => setEdit({ id:task.id, title:task.title, startDay:span?.startDay ?? "", endDay:span?.endDay ?? "", expected:ranges.find((r) => r.taskId === task.id) ?? null });
  const beginDrag = (e: MouseEvent, row: Row, edge: "move" | "start" | "end") => {
    if (!row.task || row.summary || !row.span || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); const x = e.clientX, span = row.span, task = row.task; let moved = false;
    drag.start({ onMove: (event) => { const delta = Math.round((event.clientX - x)/cell); if (delta !== 0) moved = true; if (moved) setPreview({ id:task.id, span:shiftSpan(span, delta, edge) }); }, onUp: (event) => { setPreview(null); if (moved) dateEditor(task, shiftSpan(span, Math.round((event.clientX - x)/cell), edge)); else if (edge === "move") setSelected(task.id); } }, () => setPreview(null));
  };
  const save = async () => { if (!edit || busy) return; setBusy(true); setError(""); try { await service.setRange(edit.id, edit.startDay, edit.endDay, edit.expected); setEdit(null); } catch (e) { setError(e instanceof Error ? e.message : "保存失败，日期已保留"); } finally { setBusy(false); } };
  return <section className="gantt" aria-label="长期计划甘特图"><div className="gantt-toolbar"><div><h2>把下一步放到时间里</h2><p>阶段与汇总任务由子任务计算。多日范围独立于今日时间块。</p></div><div><button aria-label="上一段甘特日期" onClick={() => setStart(addDays(start,-days))}>←</button><button onClick={() => setStart(weekOf())}>今天</button><button aria-label="下一段甘特日期" onClick={() => setStart(addDays(start,days))}>→</button><label>时间跨度<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={28}>4 周</option><option value={84}>12 周</option></select></label><button onClick={() => { setOwner(items[0]?.key ?? ""); setName(""); setDate(todayString()); setEditingMilestone(null); setNewMilestone(true); }}>添加里程碑</button></div></div>
    {error && !edit && !newMilestone && <p role="alert">{error} <button onClick={() => setRetry((n) => n+1)}>重试</button></p>}
    <p className="gantt-legend">{start} 至 {addDays(start,days-1)}<br />● 任务范围　━ 汇总范围　◆ 里程碑　<span>拖动任务条移动，拖动两端调整；松开后确认日期。也可使用每行的“日期”按钮。</span></p>
    {loading ? <p role="status">正在读取甘特数据…</p> : !rows.length ? <p className="gantt-empty">先创建一个计划或项目，再添加执行任务。</p> : <div className="gantt-scroll" tabIndex={0} aria-label="甘特时间轴，可横向滚动"><div className="gantt-grid" style={{ "--gantt-width":`${days*cell}px`, "--gantt-cell":`${cell}px` } as CSSProperties}><div className="gantt-line gantt-head"><div className="gantt-name">事项 / 阶段 / 执行任务</div><div className="gantt-calendar">{Array.from({ length:days },(_,i) => { const key=addDays(start,i); return <span key={key} className={key === todayString() ? "is-today" : ""} title={key}>{days===28 ? key.slice(8) : i%7===0 ? key.slice(5) : "·"}</span>; })}</div></div>
      {rows.map((row) => { const from=row.span ? dayDistance(start,row.span.startDay) : 0, to=row.span ? dayDistance(start,row.span.endDay) : -1, visible=!!row.span && to>=0 && from<days, left=Math.max(from,0)*cell, width=(Math.min(to,days-1)-Math.max(from,0)+1)*cell;
        return <div className={`gantt-line ${row.summary ? "is-summary" : ""}`} key={row.key}><div className="gantt-name" style={{ paddingLeft:12+row.level*14 }}>
          {row.expandable ? <button className="gantt-expand" aria-label={`${closed.has(row.key) ? "展开" : "收起"}${row.title}`} aria-expanded={!closed.has(row.key)} onClick={() => toggle(row.key)}>{closed.has(row.key) ? "›" : "⌄"}</button> : <span className="gantt-indent" />}
          <div><button className="gantt-title" onClick={() => row.task ? setSelected(row.task.id) : row.expandable && toggle(row.key)}>{row.title}</button><small>{row.hint}{row.progress != null ? ` · ${row.progress}%` : ""}{row.span ? ` · ${row.span.startDay.slice(5)}–${row.span.endDay.slice(5)}` : " · 未排期"}</small></div>
          {row.task && !row.summary && <button aria-label={`调整日期 ${row.title}`} onClick={() => dateEditor(row.task!)}>日期</button>}
          {row.milestone && <button aria-label={`编辑里程碑 ${row.title}`} onClick={() => { setEditingMilestone(row.milestone!); setOwner(row.milestone!.goalId != null ? `plan:${row.milestone!.goalId}` : `project:${row.milestone!.projectId}`); setName(row.title); setDate(row.milestone!.targetDay); setNewMilestone(true); }}>节点</button>}
          {row.milestone && <button aria-label={`${row.milestone.completed ? "重开" : "完成"}里程碑 ${row.title}`} onClick={() => void service.updateMilestone(row.milestone!.id,!row.milestone!.completed).catch((e) => setError(String(e)))}>{row.milestone.completed ? "✓" : "○"}</button>}
        </div><div className="gantt-track"><span className="gantt-today-line" style={{ left:dayDistance(start,todayString())*cell }} />{visible ? row.milestone ? <button className="gantt-diamond" style={{ left:left+cell/2 }} aria-label={`里程碑 ${row.title} ${row.span!.startDay}`} onClick={() => void service.updateMilestone(row.milestone!.id,!row.milestone!.completed).catch((e) => setError(String(e)))}>◆</button> : <div className={`gantt-bar ${row.summary ? "summary" : ""} ${row.task?.status === "COMPLETED" ? "completed" : ""}`} style={{ left,width }}>
          {row.task && !row.summary && <button className="gantt-handle start" aria-label={`调整开始日期 ${row.title}`} onMouseDown={(e) => beginDrag(e,row,"start")} onClick={() => dateEditor(row.task!)} />}
          <button className="gantt-bar-body" onMouseDown={(e) => beginDrag(e,row,"move")} onClick={(e) => { if (e.detail===0 && row.task) setSelected(row.task.id); }} aria-label={`${row.title} ${row.span!.startDay} 至 ${row.span!.endDay}`} title={`${row.title} · ${row.span!.startDay} 至 ${row.span!.endDay}`}>{row.title}</button>
          {row.task && !row.summary && <button className="gantt-handle end" aria-label={`调整结束日期 ${row.title}`} onMouseDown={(e) => beginDrag(e,row,"end")} onClick={() => dateEditor(row.task!)} />}
        </div> : <span className="gantt-unplanned">{row.span ? "范围在当前视窗之外" : "未排期"}</span>}</div></div>; })}
    </div></div>}
    <Dialog wide open={selected!=null} title="任务详情" onClose={() => setSelected(null)}>{selected!=null && <TaskDetail taskId={selected} onSelectTask={setSelected} />}</Dialog>
    <Dialog open={!!edit} title="调整长期计划日期" onClose={() => { if (!busy) { setEdit(null); setError(""); } }}><form className="gantt-form" onSubmit={(e) => { e.preventDefault(); void save(); }}><p>{edit?.title}</p><p>只改变甘特范围。留空两项可取消排期，保存后可撤销。</p><label>开始日期<input type="date" value={edit?.startDay ?? ""} onChange={(e) => setEdit(edit && { ...edit,startDay:e.target.value })} /></label><label>结束日期<input type="date" value={edit?.endDay ?? ""} onChange={(e) => setEdit(edit && { ...edit,endDay:e.target.value })} /></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>确认日期</button></form></Dialog>
    <Dialog open={newMilestone} title={editingMilestone ? "编辑里程碑" : "添加里程碑"} onClose={() => { if (!busy) { setNewMilestone(false); setError(""); } }}><form className="gantt-form" onSubmit={(e) => { e.preventDefault(); if (busy) return; setBusy(true); void (editingMilestone ? service.editMilestone(editingMilestone.id,name,date,editingMilestone.updatedAt) : service.createMilestone(owner,name,date)).then(() => { setName(""); setNewMilestone(false); }).catch((e) => setError(String(e))).finally(() => setBusy(false)); }}><label>所属事项<select aria-label="所属事项" disabled={!!editingMilestone} value={owner} onChange={(e) => setOwner(e.target.value)}>{items.map((i) => <option key={i.key} value={i.key}>{i.title}</option>)}</select></label><label>节点名称<input required value={name} onChange={(e) => setName(e.target.value)} maxLength={500} /></label><label>目标日期<input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<button disabled={busy || !owner || !name.trim()}>{editingMilestone ? "保存节点" : "添加节点"}</button>{editingMilestone && <button type="button" disabled={busy} onClick={() => { setBusy(true); void service.deleteMilestone(editingMilestone.id).then(() => setNewMilestone(false)).catch((e) => setError(String(e))).finally(() => setBusy(false)); }}>删除节点（可撤销）</button>}</form></Dialog>
  </section>;
}
