import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarPlus, Check, ChevronRight, History, ListChecks, Pause, Play, Plus, RefreshCw, Target, Trash2 } from "lucide-react";
import type { GoalWithProgress, UpdateGoalInput } from "../../db/repositories/goalRepository";
import type { PhaseWithProgress } from "../../db/repositories/longTermPlanRepository";
import type { Task } from "../../db/repositories/taskRepository";
import { calculatePlanHealth, effectiveWeeklyPaceMinutes, estimateCompletionDate } from "../../lib/longTermPlan";
import { postponeTargets } from "../../lib/postpone";
import { todayString } from "../../lib/date";
import { useLongTermPlanStore } from "../../stores/longTermPlanStore";

interface Props {
  plan: GoalWithProgress;
  onBack: () => void;
  onUpdate: (id: number, input: UpdateGoalInput) => void;
  onComplete: (id: number) => void;
  onArchive: (id: number) => void;
}

type DetailTab = "overview" | "plan" | "tasks" | "history";
const TABS: Array<{ id: DetailTab; label: string; icon: typeof Target }> = [
  { id: "overview", label: "概览", icon: Target },
  { id: "plan", label: "计划", icon: ChevronRight },
  { id: "tasks", label: "任务", icon: ListChecks },
  { id: "history", label: "记录", icon: History },
];

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

export default function LongTermPlanDetail({ plan, onBack, onUpdate, onComplete, onArchive }: Props) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const phases = useLongTermPlanStore((state) => state.phases);
  const tasks = useLongTermPlanStore((state) => state.tasks);
  const history = useLongTermPlanStore((state) => state.history);
  const loading = useLongTermPlanStore((state) => state.loadingDetail);
  const scheduleNext = useLongTermPlanStore((state) => state.scheduleNext);
  const today = todayString();
  const planned = null;
  const health = calculatePlanHealth({ status: plan.status, plannedProgress: planned, actualProgress: plan.progressPercent });
  const weeklyPace = effectiveWeeklyPaceMinutes(plan.startDate, plan.focusSeconds, plan.weeklyTargetMinutes);
  const estimated = plan.estimatedCompletionDate
    ?? (plan.totalTasks > 0 ? estimateCompletionDate(today, plan.remainingEstimatedMinutes, weeklyPace) : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <button onClick={onBack} aria-label="返回长期计划" className="rounded-lg border border-border-subtle bg-surface p-2 text-text-secondary hover:bg-surface-hover"><ArrowLeft size={17} /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-text-primary">{plan.title}</h1>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase text-accent">{String(plan.priority).replace("high", "P1").replace("medium", "P2").replace("low", "P3")}</span>
          </div>
          <p className="mt-1 text-sm text-text-muted">{plan.description || "逐阶段推进这项长期计划"}</p>
        </div>
        <button onClick={() => void scheduleNext(plan, today)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-on-accent hover:bg-accent-hover"><CalendarPlus size={15} />加入今天</button>
      </div>

      <nav className="flex gap-1 rounded-xl border border-border-subtle bg-surface/70 p-1">
        {TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm ${tab === item.id ? "bg-accent text-on-accent shadow-sm" : "text-text-muted hover:bg-surface-hover hover:text-text-primary"}`}><item.icon size={14} />{item.label}</button>)}
      </nav>

      {loading ? <div className="py-16 text-center text-sm text-text-faint">正在读取计划…</div> : (
        <>
          {tab === "overview" && <Overview plan={plan} phases={phases} health={health} estimated={estimated} onUpdate={onUpdate} onComplete={onComplete} onArchive={onArchive} />}
          {tab === "plan" && <PhasePlan plan={plan} phases={phases} onUpdate={onUpdate} />}
          {tab === "tasks" && <PlanTasks plan={plan} tasks={tasks} phases={phases} />}
          {tab === "history" && <PlanHistory entries={history} />}
        </>
      )}
    </div>
  );
}

function Overview({ plan, phases, health, estimated, onUpdate, onComplete, onArchive }: {
  plan: GoalWithProgress; phases: PhaseWithProgress[]; health: ReturnType<typeof calculatePlanHealth>; estimated: string | null;
  onUpdate: Props["onUpdate"]; onComplete: Props["onComplete"]; onArchive: Props["onArchive"];
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  const moveUnfinished = useLongTermPlanStore((state) => state.moveUnfinishedToDate);
  const weeklyActual = Math.round(plan.weeklyFocusSeconds / 60);
  const remaining = Math.max(0, plan.weeklyTargetMinutes - weeklyActual);
  const nextWeek = postponeTargets(todayString()).nextWeek;
  const healthLabel = health.state === "paused" ? "已暂停" : health.state === "unknown" ? "未建立成果基准" : health.state === "ahead" ? `超前 ${health.deviationPercent} 个百分点` : health.state === "healthy" ? "正常" : `成果相差 ${Math.abs(health.deviationPercent ?? 0)} 个百分点`;
  const rhythm = useMemo(() => parseRhythm(plan.weeklyRhythmJson), [plan.weeklyRhythmJson]);

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
    <section className="rounded-2xl border border-border-subtle bg-surface/90 p-5">
      <div className="flex items-end justify-between gap-3"><div><div className="text-xs text-text-muted">总进度</div><div className="mt-1 text-4xl font-semibold tabular-nums text-text-primary">{plan.progressPercent}%</div></div><div className={`rounded-full px-3 py-1 text-xs font-medium ${health.state.includes("behind") ? "bg-warning-soft text-warning" : health.state === "paused" ? "bg-surface-muted text-text-muted" : "bg-success-soft text-success"}`}>{healthLabel}</div></div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${plan.progressPercent}%` }} /></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="目标完成日期" value={plan.deadline || "未设置"} />
        <Stat label="预计完成日期" value={estimated || "数据不足"} warning={Boolean(estimated && plan.deadline && estimated > plan.deadline)} />
        <Stat label="当前阶段" value={plan.currentPhaseTitle || "未设置"} />
        <Stat label="每周计划投入" value={hours(plan.weeklyTargetMinutes)} />
        <Stat label="本周实际投入" value={hours(weeklyActual)} />
        <Stat label="本周尚未投入" value={hours(remaining)} />
      </div>
      <div className="mt-5 rounded-xl bg-surface-muted/70 p-3"><div className="text-[11px] text-text-faint">下一步行动</div><input defaultValue={plan.nextAction ?? ""} placeholder="明确一个可以直接开始的动作" onBlur={(event) => onUpdate(plan.id, { nextAction: event.target.value.trim() || null })} className="mt-1 w-full bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-faint" /></div>

      <details className="mt-4 rounded-xl border border-border-subtle p-3">
        <summary className="cursor-pointer text-sm font-medium text-text-secondary">计划参数</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="状态"><select value={plan.status} onChange={(event) => onUpdate(plan.id, { status: event.target.value as UpdateGoalInput["status"], pausedAt: event.target.value === "paused" ? Date.now() : null })} className="field"><option value="not_started">未开始</option><option value="active">进行中</option><option value="paused">暂停</option></select></Field>
          <Field label="优先级"><select value={String(plan.priority).replace("high", "p1").replace("medium", "p2").replace("low", "p3")} onChange={(event) => onUpdate(plan.id, { priority: event.target.value as UpdateGoalInput["priority"] })} className="field"><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="p4">P4</option></select></Field>
          <Field label="目标日期"><input type="date" value={plan.deadline ?? ""} onChange={(event) => onUpdate(plan.id, { deadline: event.target.value || null })} className="field" /></Field>
          <Field label="每周投入（小时）"><input type="number" min={0} step={0.5} defaultValue={plan.weeklyTargetMinutes / 60} onBlur={(event) => onUpdate(plan.id, { weeklyTargetMinutes: Math.max(0, Math.round(Number(event.target.value) * 60)) })} className="field" /></Field>
          <Field label="进度计算"><select value={plan.progressMode} onChange={(event) => onUpdate(plan.id, { progressMode: event.target.value as UpdateGoalInput["progressMode"] })} className="field"><option value="estimated">按预计耗时</option><option value="tasks">按任务完成数</option><option value="manual">手动进度</option></select></Field>
          <Field label="手动进度"><input type="number" min={0} max={100} defaultValue={plan.manualProgress ?? ""} placeholder="自动" onBlur={(event) => onUpdate(plan.id, { manualProgress: event.target.value === "" ? null : Math.max(0, Math.min(100, Number(event.target.value))) })} className="field" /></Field>
          <Field label="当前阶段"><select value={plan.currentPhaseId ?? ""} onChange={(event) => onUpdate(plan.id, { currentPhaseId: event.target.value ? Number(event.target.value) : null })} className="field"><option value="">未设置</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.title}</option>)}</select></Field>
        </div>
      </details>
    </section>

    <aside className="space-y-3">
      <section className="rounded-2xl border border-border-subtle bg-surface/90 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-text-primary">本周节奏</h2><span className="text-xs text-text-faint">不占用固定日历</span></div><div className="mt-3 grid grid-cols-2 gap-2">{[1,2,3,4,5,6,7].map((weekday) => <label key={weekday} className="rounded-lg bg-surface-muted/70 p-2 text-xs text-text-muted">周{["","一","二","三","四","五","六","日"][weekday]}<div className="mt-1 flex items-center gap-1"><input type="number" min={0} step={0.5} defaultValue={(rhythm.get(weekday) ?? 0) / 60} onBlur={(event) => { const next = new Map(rhythm); next.set(weekday, Math.max(0, Math.round(Number(event.target.value) * 60))); onUpdate(plan.id, { weeklyRhythmJson: JSON.stringify([...next].filter(([, minutes]) => minutes > 0).map(([day, minutes]) => ({ weekday: day, minutes }))) }); }} className="w-full rounded border border-border-subtle bg-surface px-2 py-1 text-text-primary outline-none focus:border-accent" /><span>h</span></div></label>)}</div></section>
      <button onClick={() => setShowReschedule((value) => !value)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"><RefreshCw size={15} />重新安排</button>
      {showReschedule && <section className="space-y-2 rounded-2xl border border-accent/20 bg-accent-soft/30 p-4"><p className="text-xs leading-relaxed text-text-muted">本周目标 {hours(plan.weeklyTargetMinutes)}，已完成 {hours(weeklyActual)}，剩余 {hours(remaining)}。</p><button onClick={() => setShowReschedule(false)} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-left text-xs text-text-secondary">保持本周目标，继续按节奏推进</button><button onClick={() => void moveUnfinished(nextWeek)} className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-left text-xs text-text-secondary">把未完成任务延到下周（{nextWeek.slice(5)}）</button></section>}
      <div className="grid grid-cols-2 gap-2">{plan.status === "paused" ? <button aria-label="恢复计划" onClick={() => onUpdate(plan.id, { status: "active", pausedAt: null })} className="inline-flex items-center justify-center gap-1 rounded-lg bg-success-soft px-3 py-2 text-xs text-success"><Play size={13} />恢复计划</button> : <button aria-label="暂停计划" onClick={() => onUpdate(plan.id, { status: "paused", pausedAt: Date.now() })} className="inline-flex items-center justify-center gap-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning"><Pause size={13} />暂停计划</button>}<button onClick={() => onComplete(plan.id)} className="inline-flex items-center justify-center gap-1 rounded-lg bg-success-soft px-3 py-2 text-xs text-success"><Check size={13} />完成计划</button><button onClick={() => onArchive(plan.id)} className="col-span-2 rounded-lg px-3 py-2 text-xs text-text-faint hover:bg-surface-hover">放弃 / 归档计划</button></div>
    </aside>
  </div>;
}

export function PhasePlan({ plan, phases, onUpdate }: { plan: GoalWithProgress; phases: PhaseWithProgress[]; onUpdate: Props["onUpdate"] }) {
  const [title, setTitle] = useState(""); const [estimate, setEstimate] = useState("");
  const add = useLongTermPlanStore((state) => state.addPhase); const update = useLongTermPlanStore((state) => state.updatePhase); const remove = useLongTermPlanStore((state) => state.removePhase); const move = useLongTermPlanStore((state) => state.movePhase);
  return <section className="rounded-2xl border border-border-subtle bg-surface/90 p-4"><div className="flex flex-wrap items-end gap-2"><Field label="新阶段名称"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如 Blueprint" className="field min-w-48" /></Field><Field label="预计小时"><input value={estimate} onChange={(event) => setEstimate(event.target.value)} type="number" min={0} className="field w-24" /></Field><button onClick={() => { void add(plan.id, title, estimate ? Number(estimate) * 60 : null); setTitle(""); setEstimate(""); }} disabled={!title.trim()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-accent px-3 text-sm text-on-accent disabled:opacity-40"><Plus size={14} />添加阶段</button></div>
    <div className="mt-4 space-y-2">{phases.length === 0 ? <p className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-text-faint">还没有阶段。建议先拆成 3–7 个可完成的里程碑。</p> : phases.map((phase, index) => <div key={phase.id} className="rounded-xl border border-border-subtle bg-surface-muted/35 p-3"><div className="flex items-center gap-2"><button onClick={() => onUpdate(plan.id, { currentPhaseId: phase.id })} title="设为当前阶段" className={`h-3 w-3 rounded-full border ${plan.currentPhaseId === phase.id ? "border-accent bg-accent" : "border-border-strong"}`} /><input defaultValue={phase.title} onBlur={(event) => event.target.value.trim() && void update(phase.id, { title: event.target.value.trim() })} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text-primary outline-none" /><span className="text-xs tabular-nums text-text-muted">{phase.progressPercent}%</span><button aria-label="阶段上移" disabled={index === 0} onClick={() => void move(phase.id, -1)} className="text-text-faint disabled:opacity-20"><ArrowUp size={13} /></button><button aria-label="阶段下移" disabled={index === phases.length - 1} onClick={() => void move(phase.id, 1)} className="text-text-faint disabled:opacity-20"><ArrowDown size={13} /></button><button aria-label="删除阶段" onClick={() => void remove(phase.id)} className="text-text-faint hover:text-danger"><Trash2 size={13} /></button></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: `${phase.progressPercent}%` }} /></div><div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted"><label>预计 <input type="number" min={0} step={0.5} defaultValue={phase.estimatedMinutes ? phase.estimatedMinutes / 60 : ""} onBlur={(event) => void update(phase.id, { estimatedMinutes: event.target.value ? Number(event.target.value) * 60 : null })} className="ml-1 w-14 rounded border border-border-subtle bg-surface px-1 py-0.5" />h</label><span>实际 {hours(phase.actualMinutes)}</span><span>{phase.completedTasks}/{phase.totalTasks} 任务</span><select value={phase.status} onChange={(event) => void update(phase.id, { status: event.target.value })} className="ml-auto rounded border border-border-subtle bg-surface px-1 py-0.5"><option value="not_started">未开始</option><option value="active">进行中</option><option value="completed">已完成</option></select></div></div>)}</div>
  </section>;
}

function PlanTasks({ plan, tasks, phases }: { plan: GoalWithProgress; tasks: Task[]; phases: PhaseWithProgress[] }) {
  const scheduleNext = useLongTermPlanStore((state) => state.scheduleNext); const today = todayString();
  return <section className="space-y-3"><div className="flex justify-between"><p className="text-sm text-text-muted">任务继续复用 DailyFlow 的任务、子任务、重复和专注记录。</p><button onClick={() => void scheduleNext(plan, today)} className="rounded-lg bg-accent px-3 py-2 text-xs text-on-accent">安排下一项到今天</button></div>{tasks.length === 0 ? <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center text-sm text-text-faint">暂无关联任务。填写“下一步行动”并加入 Today 后，会自动创建关联任务。</div> : <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface/90 px-3 py-2.5"><span className={`h-2 w-2 rounded-full ${task.status === "COMPLETED" ? "bg-success" : task.status === "CANCELLED" ? "bg-text-faint" : "bg-accent"}`} /><div className="min-w-0 flex-1"><div className={`truncate text-sm ${task.status === "COMPLETED" ? "text-text-faint line-through" : "text-text-primary"}`}>{task.title}</div><div className="text-[10px] text-text-faint">{phases.find((phase) => phase.id === task.phaseId)?.title ?? "未分阶段"} · {task.scheduledDate} · {task.estimatedDuration ? hours(task.estimatedDuration / 60) : "未估时"}</div></div></div>)}</div>}</section>;
}

function PlanHistory({ entries }: { entries: ReturnType<typeof useLongTermPlanStore.getState>["history"] }) {
  return <section className="rounded-2xl border border-border-subtle bg-surface/90 p-4">{entries.length === 0 ? <p className="py-10 text-center text-sm text-text-faint">关键计划变更会显示在这里。</p> : <ol className="space-y-4">{entries.map((entry) => <li key={entry.id} className="relative border-l border-border-strong pl-4"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-accent" /><div className="text-xs text-text-faint">{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</div><div className="mt-0.5 text-sm font-medium text-text-primary">{entry.label}</div><div className="text-xs text-text-muted">{entry.oldValue ?? "未设置"} → {entry.newValue ?? "未设置"}</div></li>)}</ol>}</section>;
}

function parseRhythm(raw: string): Map<number, number> { try { const value = JSON.parse(raw) as Array<{ weekday: number; minutes: number }>; return new Map(value.map((item) => [item.weekday, item.minutes])); } catch { return new Map(); } }
function Stat({ label, value, warning }: { label: string; value: string; warning?: boolean }) { return <div className="rounded-xl bg-surface-muted/60 p-3"><div className="text-[11px] text-text-faint">{label}</div><div className={`mt-1 truncate text-sm font-medium tabular-nums ${warning ? "text-warning" : "text-text-primary"}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-[11px] text-text-muted">{label}<div className="mt-1">{children}</div></label>; }
