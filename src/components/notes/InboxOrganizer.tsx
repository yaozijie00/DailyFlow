import { useEffect, useState } from "react";
import { getDb } from "../../db/db";
import { noteService, useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { PlanningWorkspaceService, type PlanningItem } from "../../services/planningWorkspaceService";
import { InboxService } from "../../services/inboxService";
import { todayString } from "../../lib/date";
import { weekOf } from "../../lib/planningDates";
import { useDataVersion } from "../../lib/dataVersion";
import { Dialog } from "../ui/Dialog";
import { convertNoteToPlanning, type NotePlanningTarget } from "../../lib/noteConvertPlanning";
import type { Note } from "../../db/repositories/noteRepository";
import { performUndo } from "../../lib/undoActions";
import TaskDetail from "../tasks/TaskDetail";
import { useAppStore } from "../../stores/appStore";
import { useLongTermPlanStore } from "../../stores/longTermPlanStore";
import { useSearchNavigationStore } from "../../stores/searchNavigationStore";
import "./inbox.css";

const service = new InboxService(getDb());
export default function InboxOrganizer({ onClose }: { onClose: () => void }) {
  const notes = useNoteStore((s) => s.notes), completed = useNoteStore((s) => s.completedNotes);
  const [tab,setTab] = useState("active"), [search,setSearch] = useState(""), [selected,setSelected] = useState<Set<number>>(new Set());
  const [current,setCurrent] = useState<number | null>(null), [draft,setDraft] = useState(""), [items,setItems] = useState<PlanningItem[]>([]), [links,setLinks] = useState<Awaited<ReturnType<InboxService["links"]>>>([]);
  const [date,setDate] = useState(todayString()), [owner,setOwner] = useState(""), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const version = useDataVersion("note"), goalVersion = useDataVersion("goal"), projectVersion = useDataVersion("project");
  const [linkedTask,setLinkedTask] = useState<number | null>(null);
  useEffect(() => { let alive=true; void Promise.all([new PlanningWorkspaceService(getDb()).list(weekOf()),service.links()]).then(([i,l]) => { if (alive) { setItems(i.filter((item) => !item.archivedAt && item.lifecycle !== "archived")); setLinks(l); } }).catch(() => { if (alive) setMessage("归属信息读取失败，请重新打开整理页"); }); return () => { alive=false; }; }, [version,goalVersion,projectVersion]);
  useEffect(() => { void useNoteStore.getState().load(); }, []);
  const all = [...notes,...completed], shown=all.filter((n) => (tab === "history" ? ["arranged","completed"].includes(n.status) : n.status === tab) && n.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const active = all.find((n) => n.id === current), ids=[...selected].filter((id) => notes.some((n) => n.id === id && n.status === "active"));
  const refresh = async () => { await Promise.all([useNoteStore.getState().load(),useTaskStore.getState().load()]); };
  const run = async (target: "task" | "saved" | "completed", override?: number) => {
    const chosen=override ? [override] : ids; if (!chosen.length || busy) return; setBusy(true); setMessage("");
    try { const results=await service.batch(chosen,target === "task" ? { scheduledDate:date,itemKey:owner || undefined } : target); const failed=results.filter((r) => !r.ok); setSelected(new Set(failed.map((r) => r.id))); setMessage(`已处理 ${results.length-failed.length} 项${failed.length ? `，${failed.length} 项未处理：${failed.map((r) => r.error).join("；")}` : "，可撤销"}`); await refresh(); }
    catch { setMessage("整理失败，未处理项已保留"); } finally { setBusy(false); }
  };
  const open = (note: Note) => { if (busy) return; setCurrent(note.id); setDraft(note.title); setMessage(""); };
  return <Dialog open wide title="整理收集箱" onClose={() => { if (!busy) onClose(); }}><div className="inbox-organizer"><p className="inbox-muted">先收集，再决定下一步。原文、去向与处理历史会保留。</p><div className="inbox-tabs" aria-label="收集箱视图">{[["active","待整理"],["saved","笔记"],["history","已处理"]].map(([value,label]) => <button key={value} aria-pressed={tab===value} onClick={() => { setTab(value); setSelected(new Set()); setCurrent(null); }}>{label} {all.filter((n) => value === "history" ? ["arranged","completed"].includes(n.status) : n.status===value).length}</button>)}<button onClick={() => void performUndo().then(refresh)}>撤销整理</button></div><input aria-label="搜索收集箱" type="search" placeholder="搜索原文…" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="inbox-columns"><section aria-label="收集项列表"><div className="inbox-list">{!shown.length ? <p className="inbox-empty">{search ? "没有匹配的收集项" : "这里暂时没有收集项"}</p> : shown.map((note) => <div key={note.id} className={`inbox-row ${current===note.id ? "selected" : ""}`}>{tab==="active" && <input type="checkbox" aria-label={`选择 ${note.title}`} checked={selected.has(note.id)} disabled={busy} onChange={(e) => setSelected((old) => { const next=new Set(old); if (e.target.checked) next.add(note.id); else next.delete(note.id); return next; })} />}<button aria-pressed={current===note.id} onClick={() => open(note)}><strong>{note.title}</strong><small>{new Date(note.createdAt).toLocaleDateString()} · {note.status==="active" ? "待整理" : note.status==="saved" ? "已保存笔记" : "已处理"}</small></button></div>)}</div>
      {tab==="active" && <div className="inbox-batch"><p>已选择 {ids.length} 项</p><label>安排日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><small>留空则暂不安排到某一天</small></label><label>归属<select aria-label="归属" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">独立任务</option>{items.map((i) => <option key={i.key} value={i.key}>{i.kind==="plan" ? "计划" : "项目"} · {i.title}</option>)}</select></label><div className="inbox-actions"><button disabled={busy || !ids.length} onClick={() => void run("task")}>批量安排为任务</button><button disabled={busy || !ids.length} onClick={() => void run("saved")}>保存为笔记</button><button disabled={busy || !ids.length} onClick={() => void run("completed")}>归档</button></div></div>}
    </section><section className="inbox-inspector" aria-label="收集项内容">{active ? <><h3>原文与去向</h3><label>收集内容<textarea value={draft} rows={7} disabled={busy || tab==="history"} onChange={(e) => setDraft(e.target.value)} /></label>{tab!=="history" && <button disabled={busy || !draft.trim() || draft===active.title} onClick={() => { setBusy(true); void noteService.update(active.id,{ title:draft.trim() }).then(refresh).then(() => setMessage("原文已保存")).catch(() => setMessage("保存失败，输入已保留")).finally(() => setBusy(false)); }}>保存原文</button>}
      {active.status==="active" && <><p className="inbox-muted">将「{active.title}」安排到 {date || "未排期"} · {items.find((i) => i.key===owner)?.title || "独立任务"}</p><div className="inbox-actions"><button disabled={busy || draft!==active.title} onClick={() => void run("task",active.id)}>安排此项</button>{(["plan","project","idea"] as NotePlanningTarget[]).map((target) => <button key={target} disabled={busy || draft!==active.title} onClick={() => { setBusy(true); void convertNoteToPlanning(getDb(),active.id,target).then(refresh).then(() => setMessage("已转换，可撤销")).catch(() => setMessage("转换失败，请检查原文后重试")).finally(() => setBusy(false)); }}>{target==="plan" ? "新建计划" : target==="project" ? "新建项目" : "转为想法"}</button>)}</div></>}
      {links.filter((l) => l.noteId===active.id).map((l) => <div key={l.noteId}><p className="inbox-muted">去向：{l.itemKey ? items.find((i) => i.key===l.itemKey)?.title || "原事项已归档或删除" : "独立任务"}</p><div className="inbox-actions">{l.taskId!=null && <button onClick={() => setLinkedTask(l.taskId)}>查看已安排任务</button>}{l.itemKey && items.some((i) => i.key===l.itemKey) && <button onClick={() => { const [kind,id]=l.itemKey!.split(":"); void useLongTermPlanStore.getState().selectPlan(null); if (kind==="plan") useSearchNavigationStore.getState().openGoal(Number(id)); else useSearchNavigationStore.getState().openProject(Number(id)); useAppStore.getState().setPage("goals"); onClose(); }}>查看所属事项</button>}</div></div>)}</> : <div className="inbox-empty">选择一项查看完整内容和去向</div>}</section></div><p role="status">{message}</p><Dialog wide open={linkedTask!=null} title="已安排任务" onClose={() => setLinkedTask(null)}>{linkedTask!=null && <TaskDetail taskId={linkedTask} onSelectTask={setLinkedTask} />}</Dialog></div></Dialog>;
}
