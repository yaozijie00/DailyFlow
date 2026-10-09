import { useEffect, useState } from "react";
import { GanttService, type TaskRange } from "../../services/ganttService";
import { getDb } from "../../db/db";
import { useDataVersion } from "../../lib/dataVersion";

const service = new GanttService(getDb());
export default function TaskPlanningRange({ taskId, summary }: { taskId:number; summary:boolean }) {
  const [range,setRange] = useState<TaskRange | null>(null), [editing,setEditing] = useState(false), [start,setStart] = useState(""), [end,setEnd] = useState("");
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [loaded,setLoaded] = useState(false), [retry,setRetry] = useState(0), version = useDataVersion("task");
  useEffect(() => { let alive=true; if (editing) return; void service.range(taskId).then((r) => { if (alive) { setRange(r); setStart(r?.startDay ?? ""); setEnd(r?.endDay ?? ""); setLoaded(true); setError(""); } }).catch(() => { if (alive) setError("长期日期读取失败"); }); return () => { alive=false; }; }, [taskId,version,editing,retry]);
  if (summary) return <section className="td-range"><h3>长期计划范围</h3><p className="td-muted">汇总范围由执行子任务的日期自动计算。</p></section>;
  return <section className="td-range"><h3>长期计划范围</h3>{editing ? <form className="td-fields" onSubmit={(e) => { e.preventDefault(); if (busy) return; setBusy(true); void service.setRange(taskId,start,end,range).then(() => setEditing(false)).catch((e) => setError(e instanceof Error ? e.message : "保存失败，日期已保留")).finally(() => setBusy(false)); }}><label>长期开始日期<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>长期结束日期<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label><p className="td-muted">不改变日安排和时间块。留空两项可取消范围。</p><div className="td-actions"><button disabled={busy}>保存长期日期</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>取消</button></div></form> : <><p className="td-muted">{range ? `${range.startDay} 至 ${range.endDay}` : "未设置多日范围"}</p><button disabled={!loaded} onClick={() => setEditing(true)}>调整长期日期</button></>}{error && <p role="alert">{error}{!loaded && <button onClick={() => setRetry((n) => n+1)}>重试</button>}</p>}</section>;
}
