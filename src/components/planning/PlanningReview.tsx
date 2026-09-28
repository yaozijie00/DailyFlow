import { useEffect, useMemo, useState } from "react";
import type { PlanningItem, PlanningWorkspaceService } from "../../services/planningWorkspaceService";
import type { PlanningReview as SavedReview, ReviewSnapshot } from "../../db/repositories/planningRepository";
import { addDays, dateKey, weekOf } from "../../lib/planningDates";
import { duration, Field, useAction } from "./planningUi";

interface Props { service: PlanningWorkspaceService; items: PlanningItem[]; itemKey?: string; refreshKey?: string; }
const minutesLabel = (value: number | null | undefined) => value == null ? "未记录" : duration(value);
function parseRows<T>(value: string): T[] { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
export default function PlanningReview({ service, items, itemKey, refreshKey }: Props) {
  const [kind, setKind] = useState<"week" | "month" | "item">(itemKey ? "item" : "week");
  const [anchor, setAnchor] = useState(weekOf()), [selectedItem, setSelectedItem] = useState(itemKey ?? "");
  const [snapshot, setSnapshot] = useState<ReviewSnapshot[]>([]), [saved, setSaved] = useState<SavedReview[]>([]), [note, setNote] = useState(""), [decisions, setDecisions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [historyVersion, setHistoryVersion] = useState(0);
  const action = useAction();
  const period = useMemo(() => {
    if (kind === "month") { const [year, month] = anchor.split("-").map(Number); return { start: `${anchor.slice(0, 7)}-01`, end: dateKey(new Date(year, month, 1)) }; }
    const start = weekOf(new Date(`${anchor}T12:00:00`)); return { start, end: addDays(start, 7) };
  }, [kind, anchor]);
  useEffect(() => {
    let alive = true; setLoading(true); setError("");
    const load = async () => {
      const weeks: string[] = [];
      for (let week = weekOf(new Date(`${period.start}T12:00:00`)); week < period.end; week = addDays(week, 7)) weeks.push(week);
      const [actual, targets] = await Promise.all([service.planning.actualByItem(period.start, period.end), Promise.all(weeks.map((week) => service.planning.listWeeks(week)))]);
      const rows = items.filter((item) => kind !== "item" || item.key === (itemKey ?? selectedItem)).map((item) => {
        const commitments = targets.map((rows) => rows.find((row) => row.itemKey === item.key));
        const complete = commitments.every((row) => row != null);
        const from = new Date(`${period.start}T00:00:00`).getTime(), to = new Date(`${period.end}T00:00:00`).getTime();
        return { key: item.key, title: item.title, originalMinutes: complete ? commitments.reduce((sum, row) => sum + (row?.originalMinutes ?? 0), 0) : null,
          plannedMinutes: complete ? commitments.reduce((sum, row) => sum + (row?.targetMinutes ?? 0), 0) : null,
          actualMinutes: Math.round(actual.get(item.key) ?? 0), completedTasks: item.tasks.filter((task) => task.status === "COMPLETED" && task.completedAt != null && task.completedAt >= from && task.completedAt < to).length };
      });
      if (alive) setSnapshot(rows);
    };
    void load().catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "复盘数据加载失败"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [service, items, kind, itemKey, selectedItem, period, refreshKey]);
  useEffect(() => { let alive = true; void service.planning.listReviews().then((rows) => { if (alive) setSaved(rows); }).catch(() => { if (alive) setError("历史复盘加载失败，请稍后重试"); }); return () => { alive = false; }; }, [service, historyVersion]);
  const changePeriod = (value: string) => { if (value) { setAnchor(kind === "month" ? `${value}-01` : value); setDecisions({}); } };
  return <div className="pw-review">
    <div className="pw-toolbar"><div><h2>{itemKey ? "事项复盘" : "把这一段投入看清楚"}</h2><p className="pw-muted">先看事实，再做下一步决定。阅读不会生成记录。</p></div></div>
    <div className="pw-review-controls">
      {!itemKey && <Field label="复盘范围"><select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setDecisions({}); }}><option value="week">周复盘</option><option value="month">月复盘</option><option value="item">单事项复盘</option></select></Field>}
      <Field label={kind === "month" ? "复盘月份" : "复盘所在周"}><input type={kind === "month" ? "month" : "date"} value={kind === "month" ? anchor.slice(0, 7) : anchor} onChange={(e) => changePeriod(e.target.value)} /></Field>
      {kind === "item" && !itemKey && <Field label="复盘事项"><select value={selectedItem} onChange={(e) => setSelectedItem(e.target.value)}><option value="">选择一个事项</option>{items.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}</select></Field>}
    </div>
    <p className="pw-muted">{period.start} — {addDays(period.end, -1)}{kind === "month" && " · 承诺为覆盖周合计，不按天分摊；缺失任一周记录则显示未记录。"}</p>
    {error && <p role="alert" className="pw-error">{error}</p>}
    {loading ? <p role="status">正在核对投入记录…</p> : <>
      <div className="pw-review-table" role="table" aria-label="复盘事实"><div className="pw-review-head" role="row"><span role="columnheader">事项</span><span role="columnheader">原承诺</span><span role="columnheader">当前承诺</span><span role="columnheader">实际投入</span><span role="columnheader">完成任务</span></div>{snapshot.map((row) => <div className="pw-review-row" role="row" key={row.key}><strong role="cell">{row.title}</strong><span role="cell" data-label="原承诺">{minutesLabel(row.originalMinutes)}</span><span role="cell" data-label="当前承诺">{minutesLabel(row.plannedMinutes)}</span><span role="cell" data-label="实际投入">{duration(row.actualMinutes)}</span><span role="cell" data-label="完成任务">{row.completedTasks ?? 0} 项</span></div>)}</div>
      {!snapshot.length && <p className="pw-empty">{kind === "item" ? "选择事项后查看该周事实。" : "还没有可复盘的事项。"}</p>}
      <p className="pw-muted">未记录的历史承诺保持未知，不用当前默认投入回填。实际投入来自该时间段的专注记录。</p>
      <form className="pw-form" onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await service.planning.saveReview({ kind, periodStart: period.start, periodEnd: period.end, ...(kind === "item" ? { itemKey: itemKey ?? selectedItem } : {}), snapshot, decisions: Object.entries(decisions).filter(([key, decision]) => decision && snapshot.some((row) => row.key === key)).map(([key, decision]) => ({ key, decision })), note }); setHistoryVersion((value) => value + 1); }, "复盘已保存，可在下方历史记录查看"); }}>
        {snapshot.length > 0 && <details className="pw-decisions"><summary>记录各事项的下一步决定（可选）</summary>{snapshot.map((row) => <Field key={row.key} label={row.title}><select value={decisions[row.key] ?? ""} onChange={(e) => setDecisions({ ...decisions, [row.key]: e.target.value })}><option value="">暂不决定</option><option value="continue">继续推进</option><option value="reduce">减少投入</option><option value="pause">暂时暂停</option><option value="complete">准备收尾</option></select></Field>)}<p className="pw-muted">决定作为复盘记录保存。具体状态和周承诺请在事项详情中调整。</p></details>}
        <Field label="复盘笔记（可选）"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="什么有效，什么需要调整？也可以留空。" /></Field>
        <button className="pw-primary" disabled={action.busy || loading || !!error || !snapshot.length}>确认并保存复盘</button>{action.message}
      </form>
    </>}
    <section className="pw-section"><div className="pw-toolbar"><h3>已保存的复盘</h3><button onClick={() => setHistoryVersion((value) => value + 1)}>刷新历史</button></div>{saved.filter((row) => !itemKey || row.itemKey === itemKey || parseRows<ReviewSnapshot>(row.snapshotJson).some((snapshot) => snapshot.key === itemKey)).map((review) => <details className="pw-saved-review" key={review.id}><summary>{review.periodStart} — {addDays(review.periodEnd, -1)} · {review.kind === "month" ? "月复盘" : review.kind === "item" ? "事项复盘" : "周复盘"}</summary><p className="pw-muted">确认于 {new Date(review.confirmedAt).toLocaleString()}</p>{parseRows<ReviewSnapshot>(review.snapshotJson).map((row) => <p key={row.key}><strong>{row.title}</strong> · 原承诺 {minutesLabel(row.originalMinutes)} · 当前 {minutesLabel(row.plannedMinutes)} · 实际 {duration(row.actualMinutes)}</p>)}{parseRows<{ key: string; decision: string }>(review.decisionsJson).map((row) => <p key={row.key}>{parseRows<ReviewSnapshot>(review.snapshotJson).find((item) => item.key === row.key)?.title ?? row.key}：{({ continue: "继续推进", reduce: "减少投入", pause: "暂时暂停", complete: "准备收尾" } as Record<string, string>)[row.decision] ?? row.decision}</p>)}{review.note && <p className="pw-review-note">{review.note}</p>}</details>)}{saved.length === 0 && <p className="pw-muted">还没有确认保存的复盘。</p>}</section>
  </div>;
}
