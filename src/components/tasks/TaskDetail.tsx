import { useEffect, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { StartFocusButton } from "../../features/focus/FocusController";
import { taskService, useTaskStore } from "../../stores/taskStore";
import { useGoalStore } from "../../stores/goalStore";
import { useProjectStore } from "../../stores/projectStore";
import { useTaskFocusStats } from "../../hooks/useTaskFocusStats";
import { formatDuration, formatDateTime } from "../../lib/format";
import { formatTimeRange } from "../../lib/timeline";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";
import { TASK_PRIORITIES, taskPriorityMeta, type TaskPriority } from "../../lib/taskPriority";
import { postponeTargets } from "../../lib/postpone";
import { todayString } from "../../lib/date";
import { useDataVersion, bumpDataVersion } from "../../lib/dataVersion";
import { ExtensionErrorBoundary, useEnabledTaskActions } from "../../extensions/host";
import { TaskTitleField, TaskNotesField } from "./TaskTextFields";
import type { Task, UpdateTaskInput } from "../../db/repositories/taskRepository";
import { Dialog } from "../ui/Dialog";
import TaskPlanningRange from "./TaskPlanningRange";
import "./taskDetail.css";

type Props = { taskId?: number; onSelectTask?: (id: number) => void };
export default function TaskDetail({ taskId, onSelectTask }: Props = {}) {
  const selected = useTaskStore((s) => s.selectedTaskId), listed = useTaskStore((s) => s.tasks);
  const id = taskId ?? selected, local = listed.find((task) => task.id === id);
  const [remote, setRemote] = useState<Task | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), version = useDataVersion("task");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let alive = true; setRemote(null); setError("");
    if (id == null || local) { setLoading(false); return; }
    setLoading(true);
    void taskService.getTask(id).then((task) => { if (alive) setRemote(task); }).catch(() => { if (alive) setError("任务读取失败"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, local, version, retry]);
  const task = local ?? (remote?.id === id ? remote : null);
  if (!task) return <div className="td-empty">{id == null ? "点击左侧任务或时间轴任务块查看详情" : loading ? "正在读取任务…" : error ? <>{error} <button onClick={() => setRetry((n) => n + 1)}>重试</button></> : "任务已不存在"}</div>;
  return <><div className="td-view-actions"><button onClick={() => setExpanded(true)}>展开详情</button></div>{!expanded && <TaskDetailContent key={task.id} task={task} onSelectTask={onSelectTask} />}<Dialog wide open={expanded} title="任务详情" onClose={() => setExpanded(false)}>{expanded && <TaskDetailContent key={task.id} task={task} onSelectTask={onSelectTask} />}</Dialog></>;
}

type Draft = { title: string; notes: string; date: string; estimate: string; priority: TaskPriority; goal: string; project: string; phase: string; base: Task };
const drafts = new Map<number, Draft>();
function draftOf(task: Task): Draft { return { title: task.title, notes: task.notes ?? "", date: task.scheduledDate, estimate: task.estimatedDuration == null ? "" : String(task.estimatedDuration / 60), priority: taskPriorityMeta(task.priority).value, goal: String(task.goalId ?? ""), project: String(task.projectId ?? ""), phase: String(task.phaseId ?? ""), base: task }; }

/** Shared, ID-scoped editor. Failed saves and selection changes retain each task's draft. */
export function TaskDetailContent({ task, onSelectTask }: { task: Task; onSelectTask?: (id: number) => void }) {
  const listed = useTaskStore((s) => s.tasks), categories = useTaskStore((s) => s.categories);
  const goals = useGoalStore((s) => s.goals), projects = useProjectStore((s) => s.projects);
  const loadGoals = useGoalStore((s) => s.load), loadProjects = useProjectStore((s) => s.load);
  const goalVersion = useDataVersion("goal"), projectVersion = useDataVersion("project");
  useEffect(() => { if (typeof loadGoals === "function") void loadGoals(); if (typeof loadProjects === "function") void loadProjects(); }, [loadGoals,loadProjects,goalVersion,projectVersion]);
  const complete = useTaskStore((s) => s.completeTask), cancel = useTaskStore((s) => s.cancelTask), remove = useTaskStore((s) => s.deleteTask);
  const toggle = useTaskStore((s) => s.toggleComplete), openEdit = useTaskStore((s) => s.openEdit), openDetail = useTaskStore((s) => s.openTaskDetail);
  const [draft, setDraft] = useState(() => drafts.get(task.id) ?? draftOf(task));
  const [editing, setEditing] = useState(drafts.has(task.id)), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [childDraft, setChildDraft] = useState(""), [remoteChildren, setChildren] = useState<Task[] | null>(null), [parent, setParent] = useState<Task | null>(null);
  const [phases,setPhases] = useState<{ id:number;title:string }[]>([]);
  useEffect(() => { let alive=true; setPhases([]); const goal=editing ? Number(draft.goal) : task.goalId; if (goal && typeof taskService.getPhases === "function") void taskService.getPhases(goal).then((rows) => { if (alive) setPhases(rows); }).catch(() => {}); return () => { alive=false; }; }, [task.goalId, draft.goal, editing]);
  const stats = useTaskFocusStats(task.id), version = useDataVersion("task"), actions = useEnabledTaskActions();
  const children = remoteChildren ?? listed.filter((row) => row.parentId === task.id), effective = children.filter((row) => row.status !== "CANCELLED");
  const active = !["COMPLETED", "CANCELLED"].includes(task.status), choose = onSelectTask ?? openDetail;
  useEffect(() => {
    let alive = true;
    if (typeof taskService.getChildren === "function") void taskService.getChildren(task.id).then((rows) => { if (alive) setChildren(rows); }).catch(() => { if (alive) setMessage("子任务暂时无法读取，请稍后重试"); });
    if (task.parentId != null) void taskService.getTask(task.parentId).then((row) => { if (alive) setParent(row); }).catch(() => {});
    return () => { alive = false; };
  }, [task.id, task.parentId, version]);
  useEffect(() => { if (!editing && !busy) setDraft(draftOf(task)); }, [task, editing, busy]);
  const change = (patch: Partial<Draft>) => { const next = { ...draft, ...patch }; setDraft(next); drafts.set(task.id, next); setEditing(true); setMessage("未保存"); };
  const reset = () => { drafts.delete(task.id); setDraft(draftOf(task)); setEditing(false); setMessage(""); };
  const save = async () => {
    if (busy || !draft.title.trim()) return;
    if (draft.estimate !== "" && (!Number.isFinite(Number(draft.estimate)) || Number(draft.estimate) < 0)) { setMessage("请输入有效的预计分钟"); return; }
    setBusy(true); setMessage("保存中…");
    try {
      const input: UpdateTaskInput = { title: draft.title.trim(), notes: draft.notes.trim() || null, estimatedDuration: draft.estimate === "" ? null : Math.round(Number(draft.estimate) * 60), priority: draft.priority };
      if (draft.date !== draft.base.scheduledDate) Object.assign(input, { scheduledDate: draft.date, plannedStart: null, plannedEnd: null });
      if (draft.goal !== String(draft.base.goalId ?? "") || draft.project !== String(draft.base.projectId ?? "")) {
        const project = projects.find((row) => row.id === Number(draft.project));
        Object.assign(input, { goalId: project?.goalId ?? (draft.goal ? Number(draft.goal) : null), projectId: draft.project ? Number(draft.project) : null, phaseId: null });
      }
      if (draft.phase !== String(draft.base.phaseId ?? "")) input.phaseId = draft.phase ? Number(draft.phase) : null;
      const updated = await taskService.updateTask(task.id, input, draft.base.updatedAt);
      if (!updated) throw new Error("任务已不存在，草稿已保留");
      drafts.delete(task.id); setDraft(draftOf(updated)); setEditing(false); setMessage("已保存");
      bumpDataVersion("task"); bumpDataVersion("goal"); bumpDataVersion("project");
      await useTaskStore.getState().load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，草稿已保留"); await useTaskStore.getState().load(); bumpDataVersion("task"); }
    finally { setBusy(false); }
  };
  const addChild = async () => { if (!childDraft.trim() || busy) return; setBusy(true); try { await taskService.createTask({ title:childDraft.trim(), scheduledDate:task.scheduledDate, categoryId:task.categoryId, goalId:task.goalId, projectId:task.projectId, phaseId:task.phaseId, parentId:task.id, priority:taskPriorityMeta(task.priority).value }); setChildDraft(""); bumpDataVersion("task"); await useTaskStore.getState().load(); } catch { setMessage("添加子任务失败，输入已保留"); } finally { setBusy(false); } };
  const projectName = projects.find((row) => row.id === task.projectId)?.title, goalName = goals.find((row) => row.id === task.goalId)?.title;
  return <article className="td-workspace"><header className="td-header">
    <p className="td-breadcrumb">{[goalName, projectName, parent?.title].filter(Boolean).join(" / ") || "独立任务"}</p>
    <div className="td-title"><h2>{task.title}</h2><span className="td-status">{TASK_STATUS_LABEL[task.status] ?? task.status}</span></div>
    <div className="td-actions">{active && effective.length === 0 && <StartFocusButton taskId={task.id} />}{active && <button onClick={() => void complete(task.id)}><Check size={16} aria-hidden="true" />完成任务</button>}<button onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" />编辑详情</button></div>
    {effective.length > 0 && <p className="td-muted">这是汇总任务，请选择执行子任务开始专注。</p>}
  </header><div className="td-body"><div className="td-content">
    {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="td-editor" onKeyDown={(event) => { if (event.key === "Escape" && !event.nativeEvent.isComposing && !busy) { event.stopPropagation(); reset(); } }}>
      <TaskTitleField disabled={busy} value={draft.title} onChange={(title) => change({ title })} /><TaskNotesField disabled={busy} value={draft.notes} onChange={(notes) => change({ notes })} />
      <div className="td-actions"><button className="td-primary" disabled={busy || !draft.title.trim()}>保存详情</button><button type="button" disabled={busy} onClick={reset}>取消编辑</button></div>
    </form> : <section><div className="td-section-head"><h3>说明与完成标准</h3><button onClick={() => setEditing(true)}>{task.notes ? "编辑说明" : "添加备注"}</button></div><p className="td-description">{task.notes || "无"}</p></section>}
    <p className="td-save" role="status">{message}{editing && task.updatedAt !== draft.base.updatedAt && <><span> 当前任务已更新，请重新核对。</span><button disabled={busy} onClick={() => { const next = { ...draft, base: task }; setDraft(next); drafts.set(task.id, next); setMessage("草稿保留，请核对后保存"); }}>使用最新版本核对草稿</button></>}</p>
    {!task.parentId && <section><div className="td-section-head"><h3>子任务（拆分）</h3><span className="td-muted">{effective.filter((row) => row.status === "COMPLETED").length}/{effective.length} 完成</span></div><ul className="td-children">{children.map((child) => <li key={child.id}><button aria-label={`完成子任务 ${child.title}`} disabled={child.status === "CANCELLED"} onClick={() => void toggle(child.id)}>{child.status === "COMPLETED" ? <Check size={16} /> : <span className="td-checkbox" />}</button><button className="td-child-title" onClick={() => choose(child.id)}>{child.title}</button><button aria-label={`删除子任务 ${child.title}`} onClick={() => void remove(child.id)}><Trash2 size={14} /></button></li>)}</ul><div className="td-actions"><input aria-label="新子任务" placeholder="拆分子任务：输入名称后回车" value={childDraft} onChange={(event) => setChildDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void addChild(); }} /><button disabled={!childDraft.trim()} onClick={() => void addChild()}>添加子任务</button></div></section>}
    {parent && <p className="td-parent">属于「{parent.title}」<button onClick={() => choose(parent.id)}>查看父任务</button></p>}
    <details className="td-records"><summary>投入与记录</summary><dl><dt>实际</dt><dd>{formatDuration(task.actualDuration) || "0分钟"}</dd><dt>Focus 投入</dt><dd>{formatDuration(stats.totalSeconds) || "0分钟"}</dd><dt>专注次数</dt><dd>{stats.count} 次（完成 {stats.completedCount} 个番茄）</dd><dt>创建时间</dt><dd>{formatDateTime(task.createdAt)}</dd><dt>完成时间</dt><dd>{formatDateTime(task.completedAt)}</dd></dl></details>
  </div><aside className="td-properties" aria-label="安排与归属"><h3>安排与归属</h3>
    <TaskPlanningRange taskId={task.id} summary={effective.length>0} />
    {editing ? <div className="td-fields"><label>日安排<input disabled={busy} type="date" value={draft.date} onChange={(event) => change({ date: event.target.value })} /></label><label>预计投入（分钟）<input disabled={busy} type="number" min={0} step="any" value={draft.estimate} onChange={(event) => change({ estimate: event.target.value })} /></label><label>优先级<select disabled={busy} value={draft.priority} onChange={(event) => change({ priority: event.target.value as TaskPriority })}>{TASK_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label><label>关联目标<select disabled={busy} value={draft.goal} onChange={(event) => change({ goal: event.target.value, project: "", phase:"" })}><option value="">无</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>项目<select disabled={busy} value={draft.project} onChange={(event) => change({ project: event.target.value, phase:"" })}><option value="">无</option>{projects.filter((project) => !draft.goal || project.goalId === Number(draft.goal)).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label>阶段<select disabled={busy || !draft.goal} aria-label="阶段" value={draft.phase} onChange={(event) => change({ phase:event.target.value })}><option value="">未分阶段</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></label><p className="td-muted">修改日安排会清空原当天时间块；多日甘特范围保持独立。</p></div> : <dl><dt>日安排</dt><dd>{task.scheduledDate || "未排期"}</dd><dt>计划时间</dt><dd>{task.plannedStart != null && task.plannedEnd != null ? formatTimeRange(task.plannedStart, task.plannedEnd) : "未设置"}</dd><dt>预计</dt><dd>{formatDuration(task.estimatedDuration) || "未设置"}</dd><dt>优先级</dt><dd>{taskPriorityMeta(task.priority).label}</dd><dt>项目</dt><dd>{projectName || "无"}</dd><dt>关联目标</dt><dd>{goalName || "无"}</dd><dt>阶段</dt><dd>{phases.find((p) => p.id===task.phaseId)?.title || "未分阶段"}</dd></dl>}
    {!editing && active && <details><summary>快速改期</summary><p className="td-muted">选择日期后应用，详情继续保留。</p><div className="td-actions">{Object.entries(postponeTargets(todayString())).filter(([key]) => ["tomorrow", "weekend", "nextWeek"].includes(key)).map(([key, date]) => <button key={key} onClick={() => change({ date })}>{({ tomorrow: "明天", weekend: "周末", nextWeek: "下周" } as Record<string,string>)[key]}</button>)}</div></details>}
    <details><summary>更多属性与操作</summary><p className="td-muted">类别：{categories.find((category) => category.id === task.categoryId)?.name || "未分类"}</p><button onClick={() => openEdit(task.id)}>完整属性编辑</button>{actions.map(({ key, Component }) => <ExtensionErrorBoundary key={key} label={key}><Component task={{ id: task.id, title: task.title, status: task.status }} /></ExtensionErrorBoundary>)}{active && <button onClick={() => void cancel(task.id)}>取消任务</button>}<button className="td-danger" onClick={() => void remove(task.id)}><Trash2 size={14} />删除</button></details>
  </aside></div></article>;
}
