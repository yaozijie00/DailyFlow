import { useEffect, useState } from "react";
import { ArrowRight, Search, Maximize2, Minimize2, ChevronDown, Play } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db/db";
import { tasks, projects, goals } from "../../db/schema";
import { TaskRepository, type Task } from "../../db/repositories/taskRepository";
import { taskService } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { todayString } from "../../lib/date";
import { executeFocus, useFocusStore } from "./focusStore";
import { FocusClock, FocusControls, FocusError, FocusRecovery, StartFocusButton } from "./FocusController";
import { focusTime, type FocusMode, type FocusRecord } from "./types";
import { Dialog } from "../../components/ui/Dialog";
import { findFocusOverlaps, historyTiming, localInput, type FocusOverlap } from "./historyEditor";
import { useBreakTimerStore } from "./breakTimerStore";
import "./focus.css";

const repo = new TaskRepository(getDb());
function hours(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}

function TaskPicker({ onSelect, disabled = false }: { onSelect: (id: number) => void; disabled?: boolean }) {
  const [search, setSearch] = useState(""), [rows, setRows] = useState<Task[]>([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [creating, setCreating] = useState(false);
  useEffect(() => {
    let alive = true; const timer = window.setTimeout(() => {
      setLoading(true);
      const now = Date.now(), today = todayString();
      void getDb().select().from(tasks).where(sql`${tasks.status} NOT IN ('COMPLETED','CANCELLED') AND ${tasks.title} LIKE ${`%${search.trim()}%`}`)
        .orderBy(sql`CASE WHEN ${tasks.plannedStart} <= ${now} AND ${tasks.plannedEnd} > ${now} THEN 0 WHEN ${tasks.scheduledDate}=${today} AND ${tasks.priority}='high' THEN 1 WHEN ${tasks.scheduledDate}=${today} THEN 2 WHEN ${tasks.id} IN (SELECT next_task_id FROM planning_meta WHERE next_task_id IS NOT NULL) THEN 3 ELSE 4 END`, sql`${tasks.updatedAt} DESC`).limit(30).all()
        .then((result) => { if (alive) { setRows(result); setError(""); } }).catch(() => { if (alive) setError("任务暂时无法读取，请修改搜索或重新打开专注页重试。"); }).finally(() => { if (alive) setLoading(false); });
    }, search ? 180 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [search]);
  const recommended = !search.trim() && !loading && !error ? rows[0] : undefined;
  const description = (task: Task) => task.plannedStart && task.plannedEnd && task.plannedStart <= Date.now() && task.plannedEnd > Date.now() ? "当前时间块" : task.scheduledDate === todayString() ? "今日任务" : task.scheduledDate || "尚未排期";
  return <section className="focus-picker" aria-label="选择任务">
    {recommended && <div className="focus-recommendation">
      <p className="focus-eyebrow">接下来推进</p>
      <h2>{recommended.title}</h2>
      <p className="focus-muted">{description(recommended)}{recommended.estimatedDuration ? ` · 预计 ${hours(recommended.estimatedDuration)}` : ""}</p>
      <button className="focus-primary focus-begin" disabled={disabled} onClick={() => onSelect(recommended.id)}><Play size={16} aria-hidden="true" />开始专注<ArrowRight size={16} aria-hidden="true" /></button>
    </div>}
    <label className="focus-search"><span>{recommended ? "或者，选择另一件事" : "选择接下来推进的事"}</span><span className="focus-search-input"><Search size={16} aria-hidden="true" /><input type="search" placeholder="搜索全部任务…" value={search} onChange={(e) => setSearch(e.target.value)} /></span></label>{loading && <p role="status" className="focus-muted">正在寻找任务…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !rows.length && <p className="focus-muted">{search ? "没有匹配的任务。可以直接用这个名称创建。" : "暂时没有待推进的任务，创建一个足够小的行动。"}</p>}
    <div className="focus-task-list">{(error || loading ? [] : rows.slice(recommended ? 1 : 0, search ? 30 : 5)).map((task) => <button key={task.id} disabled={disabled} onClick={() => onSelect(task.id)}><span><strong>{task.title}</strong><small>{description(task)}</small></span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>
    {search.trim() && <button disabled={creating || disabled} onClick={() => { setCreating(true); void taskService.createTask({ title: search.trim() }).then((task) => onSelect(task.id)).catch(() => setError("创建失败，输入已保留，请重试。")).finally(() => setCreating(false)); }}>创建任务「{search.trim()}」并开始</button>}
  </section>;
}

function TaskContext({ record }: { record: FocusRecord }) {
  const version = useFocusStore((s) => s.focusVersion);
  const [context, setContext] = useState<{ task: Task; project: string | null; goal: string | null } | null>(null);
  useEffect(() => {
    let alive = true; setContext(null);
    if (record.taskId != null) void getDb().select({ task: tasks, project: projects.title, goal: goals.title }).from(tasks).leftJoin(projects, eq(tasks.projectId, projects.id)).leftJoin(goals, eq(tasks.goalId, goals.id)).where(eq(tasks.id, record.taskId)).get().then((value) => { if (alive) setContext(value ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [record.taskId, version]);
  const task = context?.task;
  return <section className="focus-context" aria-label="任务上下文">
    <h3>任务上下文</h3>
    {[context?.goal, context?.project].some(Boolean) && <p className="focus-parent">{[context?.goal, context?.project].filter(Boolean).join(" / ")}</p>}
    {task ? <><dl><div><dt>已保存投入</dt><dd>{hours(task.actualDuration ?? 0)}</dd></div><div><dt>任务预计</dt><dd>{task.estimatedDuration ? hours(task.estimatedDuration) : "尚未设置"}</dd></div>
      {task.plannedStart != null && task.plannedEnd != null && <div><dt>计划时段</dt><dd>{new Date(task.plannedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {new Date(task.plannedEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd></div>}</dl><p className="focus-muted">本次结束后，投入会自动汇入任务。</p></> : <p className="focus-muted">{record.taskId == null ? "这次投入会保留在专注记录中。" : "投入以已保存的任务记录为准。"}</p>}
  </section>;
}

export function BreakTimer() {
  const until = useBreakTimerStore((s) => s.until);
  const configuredMinutes = useSettingsStore((s) => s.settings.shortBreakMinutes);
  const [chosenMinutes, setMinutes] = useState<number | null>(null), [now, setNow] = useState(Date.now);
  const minutes = chosenMinutes ?? configuredMinutes;
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return <section className="focus-break"><span>{until ? `休息中 ${focusTime((until - now) / 1000)}` : "给自己一个短休息"}</span>{until ? <button onClick={() => useBreakTimerStore.getState().cancel()}>结束休息</button> : <><label>分钟<input aria-label="休息分钟" type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label><button disabled={!Number.isFinite(minutes) || minutes < 1 || minutes > 60} onClick={() => { setNow(Date.now()); useBreakTimerStore.getState().start(minutes); }}>开始休息</button></>}<small>不计入任务投入</small></section>;
}

export function HistoryEditor({ session, onClose, onSaved }: { session: FocusRecord | "manual"; onClose: () => void; onSaved: () => void }) {
  const editing = session !== "manual", row = editing ? session : null;
  const [minutes, setMinutes] = useState(row ? String(row.actualSeconds / 60) : "45");
  const [start, setStart] = useState(localInput(row?.startedAt ?? Date.now() - 45 * 60000)), [note, setNote] = useState(row?.note ?? "");
  const [taskId, setTaskId] = useState(row?.taskId == null ? "" : String(row.taskId)), [options, setOptions] = useState<Task[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [overlaps, setOverlaps] = useState<FocusOverlap[]>([]), [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setOverlaps([]); setConfirmed(false); }, [start, minutes]);
  useEffect(() => { void repo.searchByTitle("", 500).then(setOptions).catch(() => setError("任务列表读取失败，请重试打开")); }, []);
  const save = async () => {
    setBusy(true); setError("");
    try {
      const timing = historyTiming(row, start, minutes);
      if (timing.startedAt !== undefined || timing.durationSeconds !== undefined) {
        const from = timing.startedAt ?? row!.startedAt, duration = timing.durationSeconds ?? Math.floor(row!.actualSeconds);
        if (!Number.isFinite(from) || !Number.isFinite(duration) || duration <= 0 || duration > 86400) { setError("请输入有效的开始时间和投入时长（不超过24小时）。"); return; }
        const matches = await findFocusOverlaps(getDb(), from, from + duration * 1000, row?.id);
        const sameWarnings = matches.every((match) => overlaps.some((prior) => prior.id === match.id));
        setOverlaps(matches);
        if (matches.length && (!confirmed || !sameWarnings)) { setConfirmed(false); return; }
      }
      const ok = await useFocusStore.getState().perform({ action: editing ? "edit" : "manual", sessionId: row?.id, expectedVersion: row?.revision, taskId: taskId ? Number(taskId) : null, ...timing, note });
      if (ok) { onSaved(); onClose(); } else setError(useFocusStore.getState().error);
    } catch { setError("记录检查或保存失败，输入已保留，请重试。"); }
    finally { setBusy(false); }
  };
  return <Dialog open title={editing ? "修正专注记录" : "补录投入"} onClose={() => { if (!busy) onClose(); }}><form className="focus-editor" onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
    <p className="focus-muted">{editing ? "仅修正时间或时长会标记为手动记录并重新统计投入；只改备注会保留原始计时。" : "忘记开始计时也可以补录，记录明确标记为 Manual。"}</p>
    <label>任务<select aria-label="任务" disabled={editing || busy} value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">无关联专注</option>{options.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
    <label>开始时间<input required disabled={busy} type="datetime-local" step="1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
    <label>投入分钟<input required disabled={busy} type="number" min="0" step="any" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
    <label>备注<textarea disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {!!overlaps.length && <div role="alert"><p>这段时间与 {overlaps.length} 条投入记录重叠：{overlaps.slice(0, 3).map((match) => match.title).join("、")}。保存后会分别累计，可能重复计算投入。</p><label className="focus-check"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我确认保留重叠的投入记录</label></div>}
    {error && <p role="alert">{error}</p>}<button disabled={busy} className="focus-primary">{busy ? "正在检查并保存…" : "保存记录"}</button>
  </form></Dialog>;
}

function FocusHistory() {
  const version = useFocusStore((s) => s.focusVersion), busy = useFocusStore((s) => s.busy);
  const [rows, setRows] = useState<FocusRecord[]>([]), [error, setError] = useState(""), [refresh, setRefresh] = useState(0), [limit, setLimit] = useState(30);
  const [edit, setEdit] = useState<FocusRecord | "manual" | null>(null), [remove, setRemove] = useState<FocusRecord | null>(null);
  useEffect(() => { let alive = true; void executeFocus({ action: "list", limit }).then((result) => { if (alive) { setRows(result.sessions ?? []); setError(""); } }).catch((reason) => { if (alive) setError(String(reason)); }); return () => { alive = false; }; }, [version, refresh, limit]);
  return <section className="focus-history"><header><h2>投入记录</h2><button onClick={() => setEdit("manual")}>补录时间</button></header>{error ? <p role="alert">记录暂时无法读取。<button onClick={() => setRefresh((v) => v + 1)}>重试</button></p> : !rows.length ? <p className="focus-muted">完成一次专注后，会在这里留下真实投入。也可以补录已完成的工作。</p> : rows.map((row) => <details key={row.id}><summary><span>{new Date(row.startedAt).toLocaleDateString()} · {new Date(row.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><strong>{row.taskTitle}</strong><span>{focusTime(row.actualSeconds)}{row.source === "manual" ? " · Manual" : row.source === "legacy" ? " · 历史" : ""}</span></summary><div className="focus-history-detail"><p>{row.note || "未填写备注"}</p>{row.nextAction && <p>下一步：{row.nextAction}</p>}<p className="focus-muted">{row.interruptionCount} 次中断 · {row.goalSeconds ? `本次目标 ${Math.round(row.goalSeconds / 60)} 分钟` : "自由计时"}</p><div className="focus-actions"><button onClick={() => setEdit(row)}>编辑记录</button><button onClick={() => setRemove(row)}>删除错误记录</button>{row.taskId != null && <StartFocusButton taskId={row.taskId} />}</div></div></details>)}
    {rows.length >= limit && limit < 1000 && <button onClick={() => setLimit((v) => v + 30)}>加载更早记录</button>}
    {edit && <HistoryEditor session={edit} onClose={() => setEdit(null)} onSaved={() => setRefresh((v) => v + 1)} />}
    <Dialog open={!!remove} title="删除错误记录" onClose={() => { if (!busy) setRemove(null); }}><p>删除「{remove?.taskTitle}」的 {focusTime(remove?.actualSeconds ?? 0)}？任务和长期投入会相应减少，此操作无法撤销。</p><FocusError /><button disabled={busy} onClick={() => remove && void useFocusStore.getState().perform({ action: "delete", sessionId: remove.id, expectedVersion: remove.revision }).then((ok) => { if (ok) setRemove(null); })}>确认删除</button></Dialog>
  </section>;
}

export default function FocusWorkspace() {
  const active = useFocusStore((s) => s.active), busy = useFocusStore((s) => s.busy), note = useFocusStore((s) => s.noteDraft), last = useFocusStore((s) => s.lastFinished);
  const breakUntil = useBreakTimerStore((s) => s.until);
  const pomodoroMinutes = useSettingsStore((s) => s.settings.pomodoroDurationMinutes);
  const [mode, setMode] = useState<FocusMode>("stopwatch"), [goal, setGoal] = useState(60), [choose, setChoose] = useState(false), [immersive, setImmersive] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("focus-immersive", immersive); return () => document.documentElement.classList.remove("focus-immersive"); }, [immersive]);
  const validGoal = mode === "stopwatch" || (Number.isFinite(goal) && goal >= 1 && goal <= 1440);
  const start = (id: number | null) => { if (validGoal) void useFocusStore.getState().start(id, mode, mode === "stopwatch" ? null : Math.round(goal * 60)).then(() => setChoose(false)); };
  return <div className={`focus-workspace ${active ? "has-session" : "is-idle"}`}>
    <header className="focus-heading"><div><h1>专注</h1><p className="focus-muted">{active ? "把注意力，留给眼前这件事。" : "选一件值得推进的事，从现在开始。"}</p></div>
      <button className="focus-immersion-toggle" onClick={() => setImmersive(!immersive)}>{immersive ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}{immersive ? "退出沉浸" : "沉浸模式"}</button>
    </header>
    <FocusError /><FocusRecovery />
    {active ? <section className={`focus-running ${active.status}`} aria-label="本次专注">
      <div className="focus-session-main">
        <p className="focus-eyebrow"><span className="focus-state-dot" />{active.status === "running" ? "正在推进" : active.status === "paused" ? "已暂停" : "等待确认恢复"}</p>
        <h2>{active.taskTitle}</h2>
        <div className="focus-time"><span>本次已投入</span><FocusClock record={active} /></div>
        <div className="focus-session-caption">
          {active.status === "paused" ? <p>已暂停 <FocusClock record={active} paused /> · 暂停期间不计时</p> : <p>{active.goalSeconds ? `本次目标 ${Math.round(active.goalSeconds / 60)} 分钟 · 达到后可继续` : "自由计时 · 按自己的节奏推进"}</p>}
        </div>
        <FocusControls />
        <label className="focus-note"><span>随手记 <small>进展、卡点，或下一步</small></span><textarea rows={3} value={note} onChange={(e) => useFocusStore.getState().setDraft("noteDraft", e.target.value)} placeholder="记下想法，继续手上的事…" /></label>
      </div>
      <aside className="focus-session-aside">
        <TaskContext record={active} />
        <div className="focus-secondary-actions">
          <button disabled={busy || active.status === "recovery"} aria-expanded={choose} aria-controls="focus-switch-picker" onClick={() => setChoose(!choose)}>切换任务<ArrowRight size={14} aria-hidden="true" /></button>
          <button disabled={busy || active.status === "recovery"} onClick={() => void useFocusStore.getState().perform({ action: "interrupt" })}>记一次中断<span>{active.interruptionCount}</span></button>
        </div>
      </aside>
      {choose && <div id="focus-switch-picker" className="focus-switch-picker"><TaskPicker onSelect={start} disabled={busy || !validGoal} /></div>}
    </section> : <div className="focus-idle-grid">
      <TaskPicker onSelect={start} disabled={busy || !validGoal} />
      <aside className="focus-setup" aria-label="本次专注设置"><h2>按你的节奏</h2><p className="focus-muted">默认自由计时，也可以为这次投入设一个目标。</p>
        <div className="focus-mode"><label>计时模式<select value={mode} onChange={(e) => { const value = e.target.value as FocusMode; setMode(value); if (value === "pomodoro") setGoal(pomodoroMinutes); }}><option value="stopwatch">自由计时</option><option value="countdown">目标计时</option><option value="pomodoro">番茄节奏</option></select></label>{mode !== "stopwatch" && <label>本次目标（分钟）<input type="number" min="1" max="1440" value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></label>}</div>
        {!validGoal && <p role="alert" className="focus-muted">请输入 1–1440 分钟。</p>}
        <div className="focus-unlinked-area"><p className="focus-muted">还没决定关联哪个任务？</p><button disabled={busy || !validGoal} className="focus-unlinked" onClick={() => start(null)}>开始无关联专注<ArrowRight size={14} aria-hidden="true" /></button></div>
        {(last || breakUntil) && <BreakTimer />}
      </aside>
    </div>}
    {!immersive && <details className="focus-history-collapse"><summary><span>投入记录</span><span className="focus-muted">回看与补录<ChevronDown size={15} aria-hidden="true" /></span></summary><FocusHistory /></details>}
  </div>;
}
