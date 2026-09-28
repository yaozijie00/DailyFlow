import { StartFocusButton } from "../../features/focus/FocusController";
import { useEffect, useState, type FormEvent } from "react";
import type { PlanningItem, PlanningWorkspaceService } from "../../services/planningWorkspaceService";
import type { Lifecycle, MetaPatch } from "../../db/repositories/planningRepository";
import { addDays, dateKey } from "../../lib/planningDates";
import { Dialog } from "../ui/Dialog";
import PlanningReview from "./PlanningReview";
import { duration, Field, lifecycleLabels, Tabs, useAction } from "./planningUi";

interface Props { item: PlanningItem; week: string; service: PlanningWorkspaceService; onChanged: () => Promise<void>; onClose: () => void; onOpenPlan?: (id: number) => void; }
export default function PlanningDetail({ item, week, service, onChanged, onClose, onOpenPlan }: Props) {
  const [tab, setTab] = useState<"概览" | "任务" | "复盘">("概览");
  const [title, setTitle] = useState(item.title), [editingTitle, setEditingTitle] = useState(false);
  const [schedule, setSchedule] = useState<{ date: string; id?: number; title: string; previous: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState(dateKey(new Date()));
  const action = useAction();
  const save = (patch: MetaPatch) => action.run(async () => { await service.update(item.key, patch); await onChanged(); });
  const doSchedule = async (date: string, id?: number) => {
    if (await action.run(async () => { await service.scheduleNext(item.key, date, id); await onChanged(); }, "下一步已排期")) setSchedule(null);
  };
  const requestSchedule = (date: string) => {
    const task = item.nextTask;
    if (task?.scheduledDate && task.scheduledDate !== date) setSchedule({ date, id: task.id, title: task.title, previous: task.scheduledDate });
    else void doSchedule(date, task?.id);
  };
  const pending = item.tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)
    && !item.tasks.some((child) => child.parentId === task.id && child.status !== "CANCELLED"));
  return <>
    <div className="pw-toolbar"><span className="pw-eyebrow">{item.kind === "plan" ? "长期计划" : "项目"} / {item.archivedAt ? "已归档" : lifecycleLabels[item.lifecycle]}</span><button onClick={onClose}>关闭详情</button></div>
    {editingTitle ? <form className="pw-inline" onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await service.rename(item.key, title); setEditingTitle(false); await onChanged(); }); }}><Field label="修改事项名称"><input required value={title} onChange={(e) => setTitle(e.target.value)} /></Field><button disabled={action.busy}>保存名称</button><button type="button" onClick={() => setEditingTitle(false)}>取消</button></form> : <h2 className="pw-detail-title"><button title="修改名称" onClick={() => { setTitle(item.title); setEditingTitle(true); }}>{item.title}</button></h2>}
    <Tabs label="事项详情" value={tab} options={["概览", "任务", "复盘"]} onChange={setTab} />
    {action.message}
    {tab === "概览" && <>
      {!!item.health?.length && <section className="pw-section" aria-label="推进提醒"><h3>可以回顾一下</h3>{item.health.map((reason) => <p key={reason.code} className="pw-muted">{reason.detail}</p>)}</section>}
      <section className="pw-section"><div className="pw-toolbar"><h3>下一步行动</h3><span className="pw-muted">{item.nextTask?.scheduledDate || "未排期"}</span></div><p className="pw-next-focus">{item.nextAction ?? "先选一个足够小的行动"}</p>
        <div className="pw-inline">{item.nextTask && <StartFocusButton taskId={item.nextTask.id} />}<button className="pw-primary" disabled={action.busy || !item.nextAction} onClick={() => requestSchedule(dateKey(new Date()))}>加入今天</button><button disabled={action.busy || !item.nextAction} onClick={() => requestSchedule(addDays(dateKey(new Date()), 1))}>安排明天</button><input aria-label="下一步排期日期" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /><button disabled={action.busy || !item.nextAction || !scheduleDate} onClick={() => requestSchedule(scheduleDate)}>按日期安排</button></div>
        {pending.length > 0 && <Field label="选择下一步任务"><select value={item.nextTask?.id ?? ""} disabled={action.busy} onChange={(e) => { if (e.target.value) void save({ nextTaskId: Number(e.target.value) }); }}><option value="">选择已有任务</option>{pending.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field>}
        <AddTask item={item} service={service} onChanged={onChanged} />
      </section>
      <section className="pw-section"><h3>成果进度</h3><p>{item.progressLabel}</p>{item.progress != null && <progress aria-label="成果进度" max={100} value={item.progress} />}<p className="pw-muted">准备清单独立记录，不计入成果进度。</p></section>
      <WeekEditor key={week} item={item} week={week} service={service} onChanged={onChanged} />
      <MetadataEditor item={item} service={service} onChanged={onChanged} />
      {item.kind === "project" && <PreparationEditor item={item} service={service} onChanged={onChanged} />}
      <ChangeHistory item={item} service={service} />
      <section className="pw-section pw-inline">{item.kind === "plan" && onOpenPlan && <button onClick={() => onOpenPlan(item.id)}>管理计划阶段</button>}<button disabled={action.busy} onClick={() => void save({ archivedAt: item.archivedAt ? null : Date.now(), ...(item.lifecycle === "archived" ? { lifecycle: "not_started" } : {}) })}>{item.archivedAt ? "取消归档" : "归档事项"}</button></section>
    </>}
    {tab === "任务" && <TaskPlanner item={item} service={service} onChanged={onChanged} />}
    {tab === "复盘" && <PlanningReview service={service} items={[item]} itemKey={item.key} refreshKey={`${item.actualMinutes}:${item.week?.updatedAt}:${item.meta?.updatedAt}`} />}
    <Dialog open={!!schedule} onClose={() => { if (!action.busy) setSchedule(null); }} title="确认改期" footer={<><button className="pw-dialog-button" disabled={action.busy} onClick={() => setSchedule(null)}>取消</button><button className="pw-dialog-button pw-dialog-primary" disabled={action.busy} onClick={() => schedule && void doSchedule(schedule.date, schedule.id)}>确认改期</button></>}>
      <p>「{schedule?.title}」已安排在 {schedule?.previous}，将移动到 {schedule?.date}。</p><p className="pw-muted">原时间段将清空，任务不会重复创建。</p>{action.message}
    </Dialog>
  </>;
}

function AddTask({ item, service, onChanged }: Pick<Props, "item" | "service" | "onChanged">) {
  const [title, setTitle] = useState(""), [estimate, setEstimate] = useState(""); const action = useAction();
  return <form className="pw-add-task" onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await service.addTask(item.key, title, estimate === "" ? undefined : Number(estimate)); setTitle(""); setEstimate(""); await onChanged(); }, "已添加下一步，尚未排期"); }}>
    <Field label="新下一步行动"><input value={title} required onChange={(e) => setTitle(e.target.value)} placeholder="用一个具体动作开始" /></Field><Field label="预计分钟（可选）"><input type="number" min="0" step="1" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="不确定可留空" /></Field><button disabled={action.busy || !title.trim()}>添加下一步</button>{action.message}
  </form>;
}

function WeekEditor({ item, week, service, onChanged }: Pick<Props, "item" | "week" | "service" | "onChanged">) {
  const [hours, setHours] = useState(item.week ? String(item.week.targetMinutes / 60) : ""), [reason, setReason] = useState(""), [intention, setIntention] = useState(item.week?.intention ?? ""), [dirty, setDirty] = useState(false);
  const action = useAction();
  useEffect(() => { if (!dirty) { setHours(item.week ? String(item.week.targetMinutes / 60) : ""); setIntention(item.week?.intention ?? ""); } }, [item.week, dirty]);
  return <section className="pw-section"><h3>本周承诺 <span className="pw-muted">{week}</span></h3><p className="pw-muted">实际 {duration(item.actualMinutes)} · 原承诺 {item.week ? duration(item.week.originalMinutes) : "未记录"} · 当前 {item.week ? duration(item.week.targetMinutes) : "未承诺"}</p>
    <form className="pw-form" onSubmit={(event) => { event.preventDefault(); void action.run(async () => { await service.setWeek(item.key, week, Math.round(Number(hours) * 60), reason, intention); await onChanged(); setDirty(false); setReason(""); }); }}>
      <Field label="本周承诺（小时）"><input required type="number" min="0" max="168" step="0.25" value={hours} onChange={(e) => { setDirty(true); setHours(e.target.value); }} placeholder="尚未承诺" /></Field>
      <Field label="本周想完成什么（可选）"><input value={intention} onChange={(e) => { setDirty(true); setIntention(e.target.value); }} /></Field>
      <Field label="调整原因（可选）"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="保留调整时的判断" /></Field>
      <div className="pw-inline"><button className="pw-primary" disabled={action.busy || hours === ""}>确认本周承诺</button><button type="button" onClick={() => { setHours(String(item.weeklyTargetMinutes / 60)); setDirty(true); }}>填入默认投入</button><button type="button" onClick={() => { setHours("0"); setDirty(true); }}>本周暂不投入</button></div>{action.message}
    </form>
  </section>;
}

function MetadataEditor({ item, service, onChanged }: Pick<Props, "item" | "service" | "onChanged">) {
  const [description, setDescription] = useState(item.description), [lifecycle, setLifecycle] = useState<Lifecycle>(item.lifecycle === "archived" ? "not_started" : item.lifecycle), [priority, setPriority] = useState(item.priority), [date, setDate] = useState(item.targetDate ?? ""), [hours, setHours] = useState(String(item.weeklyTargetMinutes / 60)), [manual, setManual] = useState(item.progressLabel.includes("手动") ? String(item.progress ?? "") : "");
  const [dirty, setDirty] = useState(false); const action = useAction();
  useEffect(() => { if (!dirty) { setDescription(item.description); setLifecycle(item.lifecycle === "archived" ? "not_started" : item.lifecycle); setPriority(item.priority); setDate(item.targetDate ?? ""); setHours(String(item.weeklyTargetMinutes / 60)); setManual(item.progressLabel.includes("手动") ? String(item.progress ?? "") : ""); } }, [item, dirty]);
  const lifecycleOptions = item.kind === "project" ? ["idea", "not_started", "preparation", "ready", "active", "paused", "completed"] : ["idea", "not_started", "active", "paused", "completed"];
  return <section className="pw-section"><h3>事项设置</h3><form className="pw-form" onChange={() => setDirty(true)} onSubmit={(e: FormEvent) => { e.preventDefault(); void action.run(async () => {
    await service.update(item.key, { description, lifecycle: lifecycle as Lifecycle, ...(lifecycle === "paused" && item.lifecycle !== "paused" ? { pausedFrom: item.lifecycle } : {}), priority, targetDate: date || null, weeklyTargetMinutes: Math.round(Number(hours) * 60), manualProgress: manual === "" ? null : Number(manual) }); await onChanged(); setDirty(false);
  }); }}>
    <Field label="期望成果"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    <div className="pw-form-grid"><Field label="生命周期"><select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as Lifecycle)}>{lifecycleOptions.map((value) => <option key={value} value={value}>{lifecycleLabels[value]}</option>)}</select></Field><Field label="优先级"><select value={priority} onChange={(e) => setPriority(e.target.value)}>{["p1", "p2", "p3", "p4"].map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></Field>
      <Field label="目标日期（可选）"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="每周默认投入（小时）"><input type="number" required min="0" max="168" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field><Field label="手动成果进度（%）"><input type="number" min="0" max="100" step="1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="留空按任务计算" /></Field></div>
    <p className="pw-muted">默认投入仅供规划；本周承诺需单独确认。清空手动进度可恢复按任务计算。</p><button disabled={action.busy}>保存事项设置</button>{action.message}
  </form></section>;
}

function ChangeHistory({ item, service }: Pick<Props, "item" | "service">) {
  const [rows, setRows] = useState<Awaited<ReturnType<PlanningWorkspaceService["planning"]["history"]>>>([]), [error, setError] = useState("");
  useEffect(() => { let alive = true; void service.planning.history(item.key).then((rows) => { if (alive) { setRows(rows); setError(""); } }).catch(() => { if (alive) setError("调整记录暂时无法加载"); }); return () => { alive = false; }; }, [service, item.key, item.meta?.updatedAt, item.week?.updatedAt]);
  const labels: Record<string, string> = { lifecycle: "生命周期", weeklyTargetMinutes: "默认投入", targetDate: "目标日期", priority: "优先级", manualProgress: "手动进度", nextTaskId: "下一步", preparationJson: "准备清单", archivedAt: "归档状态", description: "期望成果", targetMinutes: "本周承诺", intention: "本周意图" };
  const readable = (field: string, raw: string | null) => {
    if (raw == null || raw === "null") return "未设置";
    let value: unknown = raw; try { value = JSON.parse(raw); } catch { /* Plain historical text. */ }
    if (field === "lifecycle" && typeof value === "string") return lifecycleLabels[value] ?? value;
    if (["targetMinutes", "weeklyTargetMinutes"].includes(field) && Number.isFinite(Number(value))) return duration(Number(value));
    if (field === "nextTaskId") return item.tasks.find((task) => task.id === Number(value))?.title ?? "已移除的任务";
    if (field === "archivedAt") return value ? "已归档" : "未归档";
    if (Array.isArray(value)) return `${value.length} 项`;
    if (value && typeof value === "object") {
      const entry = value as Record<string, unknown>;
      if (field === "weekly_target") return `${String(entry.week ?? "本周")} · ${duration(Number(entry.minutes ?? 0))}${entry.intention ? ` · ${String(entry.intention)}` : ""}`;
      if (field === "settings") return [
        lifecycleLabels[String(entry.status)] ?? String(entry.status),
        `${duration(Number(entry.weeklyMinutes ?? 0))} / 周`,
        String(entry.priority ?? "").toUpperCase(),
        entry.targetDate ? `目标 ${String(entry.targetDate)}` : "未设目标日期",
        entry.archivedAt ? "已归档" : "",
      ].filter(Boolean).join(" · ");
      return "记录已更新";
    }
    return String(value);
  };
  return <details className="pw-section pw-change-history"><summary>调整记录（{rows.length}）</summary>{error && <p role="alert">{error}</p>}{rows.map((row) => <div className="pw-history-entry" key={row.id}><span className="pw-muted">{new Date(row.createdAt).toLocaleString()}</span><p>{labels[row.field] ?? (row.field.startsWith("week:") ? "本周承诺" : "事项调整")}：{readable(row.field, row.oldValue)} → {readable(row.field, row.newValue)}</p>{row.reason && <p className="pw-muted">{row.reason}</p>}</div>)}{!rows.length && !error && <p className="pw-muted">还没有调整记录。</p>}</details>;
}

function PreparationEditor({ item, service, onChanged }: Pick<Props, "item" | "service" | "onChanged">) {
  const [entry, setEntry] = useState(""); const action = useAction();
  let entries: Array<{ title: string; done: boolean }> = [];
  try { entries = JSON.parse(item.meta?.preparationJson ?? "[]"); } catch { /* Invalid legacy data remains editable as a fresh checklist. */ }
  const persist = (next: typeof entries) => action.run(async () => { await service.update(item.key, { preparationJson: JSON.stringify(next) }); await onChanged(); });
  return <section className="pw-section"><h3>项目准备清单</h3><p className="pw-muted">{entries.filter((row) => row.done).length} / {entries.length} 项准备就绪 · 独立于成果进度</p>{entries.map((row, index) => <div key={`${index}:${row.title}`} className="pw-toolbar"><label className="pw-check"><input type="checkbox" checked={row.done} disabled={action.busy} onChange={(e) => void persist(entries.map((entry, i) => i === index ? { ...entry, done: e.target.checked } : entry))} />{row.title}</label><button aria-label={`移除准备项 ${row.title}`} disabled={action.busy} onClick={() => void persist(entries.filter((_, i) => i !== index))}>移除</button></div>)}
    <form className="pw-inline" onSubmit={(e) => { e.preventDefault(); void persist([...entries, { title: entry.trim(), done: false }]).then((success) => { if (success) setEntry(""); }); }}><input aria-label="新准备项" placeholder="例如：整理参考资料" required value={entry} onChange={(e) => setEntry(e.target.value)} /><button disabled={action.busy || !entry.trim()}>添加准备项</button></form>{action.message}
  </section>;
}

function TaskPlanner({ item, service, onChanged }: Pick<Props, "item" | "service" | "onChanged">) {
  const [selected, setSelected] = useState<number[]>([]), [date, setDate] = useState(addDays(dateKey(new Date()), 1)), [preview, setPreview] = useState(false);
  const action = useAction(), pending = item.tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status));
  const chosen = pending.filter((task) => selected.includes(task.id));
  return <section className="pw-section"><h3>行动与排期</h3><p className="pw-muted">只移动勾选的任务。未排期的任务也可以在这里安排。</p>
    {item.tasks.length ? <ul className="pw-task-list">{item.tasks.map((task) => <li key={task.id}><label className="pw-check"><input type="checkbox" disabled={["COMPLETED", "CANCELLED"].includes(task.status) || action.busy} checked={selected.includes(task.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, task.id] : selected.filter((id) => id !== task.id))} /><span><strong>{task.title}</strong><small>{task.status === "COMPLETED" ? "已完成" : task.status === "CANCELLED" ? "已取消" : task.scheduledDate || "未排期"}{task.estimatedDuration ? ` · 预计 ${duration(task.estimatedDuration / 60)}` : " · 未估时"}</small></span></label></li>)}</ul> : <p className="pw-empty">还没有任务。先添加一个下一步。</p>}
    <AddTask item={item} service={service} onChanged={onChanged} />
    <div className="pw-inline"><Field label="所选任务移动到"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><button disabled={!chosen.length || !date || action.busy} onClick={() => setPreview(true)}>预览改期（{chosen.length}）</button></div>{action.message}
    <Dialog open={preview} onClose={() => { if (!action.busy) setPreview(false); }} title="改期预览" footer={<><button className="pw-dialog-button" disabled={action.busy} onClick={() => setPreview(false)}>取消</button><button className="pw-dialog-button pw-dialog-primary" disabled={action.busy || !chosen.length} onClick={() => void action.run(async () => { await service.moveTasks(item.key, chosen.map((task) => task.id), date); setSelected([]); setPreview(false); await onChanged(); }, "所选任务已改期")}>确认移动所选任务</button></>}>
      <ul className="pw-task-list">{chosen.map((task) => <li key={task.id}>{task.title}<small>{task.scheduledDate || "未排期"} → {date}</small></li>)}</ul><p>将清空这些任务原有的时间段。其他任务保持原安排。</p>{action.message}
    </Dialog>
  </section>;
}
