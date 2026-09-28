import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { GripVertical, Pause, Play, Timer } from "lucide-react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { useBreakTimerStore } from "./breakTimerStore";
import { useFocusStore } from "./focusStore";
import { elapsedSeconds, focusTime, type FocusRecord } from "./types";
import { useAppStore } from "../../stores/appStore";
import { useTaskStore } from "../../stores/taskStore";
import { bumpDataVersion } from "../../lib/dataVersion";
import { Dialog } from "../../components/ui/Dialog";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";
import { evaluateAndNotify } from "../../services/achievementRuntime";
import { scheduleFocusEndNotification, cancelScheduledFocusEndNotification } from "../../services/notificationService";
import "./focus.css";

export function FocusBridge({ notifications = true }: { notifications?: boolean }) {
  const active = useFocusStore((s) => s.active);
  useEffect(() => {
    if (!notifications) return;
    const check = () => { if (useBreakTimerStore.getState().finishIfDue()) useAppStore.getState().pushToast("info", "休息结束，可以继续推进任务"); };
    check(); const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [notifications]);
  useEffect(() => {
    let disposed = false; const stop: (() => void)[] = [];
    const sync = () => { void useFocusStore.getState().sync(); };
    for (const event of ["df:focus-changed", "df:focus-tick"]) {
      void listen(event, () => {
        sync();
        if (event === "df:focus-changed") {
          useFocusStore.setState((s) => ({ focusVersion: s.focusVersion + 1 }));
          bumpDataVersion("focus"); bumpDataVersion("task");
          void useTaskStore.getState().load();
        }
      }).then((fn) => { if (disposed) fn(); else stop.push(fn); }).catch(() => {});
    }
    sync();
    window.addEventListener("focus", sync);
    return () => { disposed = true; stop.forEach((fn) => fn()); window.removeEventListener("focus", sync); };
  }, []);
  useEffect(() => {
    if (!notifications) return;
    cancelScheduledFocusEndNotification();
    if (active?.status === "running" && active.goalSeconds && elapsedSeconds(active) < active.goalSeconds) {
      scheduleFocusEndNotification(Date.now() + (active.goalSeconds - elapsedSeconds(active)) * 1000, Math.round(active.goalSeconds / 60));
    }
    // Checkpoints do not reschedule the same goal notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.status, active?.goalSeconds, notifications]);
  return null;
}

export function FocusClock({ record, paused = false }: { record: FocusRecord; paused?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (record.status !== "running" && !paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [record.status, paused]);
  return <time className="focus-clock" aria-label={paused ? "暂停时长" : "本次已投入"}>{focusTime(paused && record.pausedAt ? (now - record.pausedAt) / 1000 : elapsedSeconds(record, now))}</time>;
}

export function StartFocusButton({ taskId, title, compact = false }: { taskId: number; title?: string; compact?: boolean }) {
  const activeId = useFocusStore((s) => s.active?.taskId), busy = useFocusStore((s) => s.busy);
  return <button type="button" className="focus-start" title="开始专注" aria-label={`开始专注${title ? ` ${title}` : ""}`} disabled={busy} onClick={(event) => {
    event.stopPropagation();
    if (activeId === taskId) useAppStore.getState().setPage("focus");
    else void useFocusStore.getState().start(taskId);
  }}><Timer size={14} />{!compact && (activeId === taskId ? "专注中" : "开始专注")}</button>;
}

export function FocusControls() {
  const active = useFocusStore((s) => s.active), busy = useFocusStore((s) => s.busy);
  if (!active || active.status === "recovery") return null;
  const paused = active.status === "paused";
  return <div className="focus-actions"><button aria-label={paused ? "继续" : "暂停"} disabled={busy} className="focus-primary" onClick={() => void useFocusStore.getState().perform({ action: paused ? "resume" : "pause" })}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? "继续" : "暂停"}</button><button aria-label="结束本次" disabled={busy} onClick={() => void useFocusStore.getState().openFinish()}>结束本次</button></div>;
}
export function FocusError() {
  const error = useFocusStore((s) => s.error), busy = useFocusStore((s) => s.busy), retry = useFocusStore((s) => s.failedRequest);
  if (!error) return null;
  return <div role="alert" className="focus-error">{error}<div className="focus-actions">{retry && <button type="button" disabled={busy} onClick={() => void useFocusStore.getState().retry()}>重试保存</button>}<button type="button" disabled={busy} onClick={() => { useFocusStore.setState({ error: "", failedRequest: null }); void useFocusStore.getState().sync(); }}>刷新状态</button></div></div>;
}
export function FocusRecovery() {
  const active = useFocusStore((s) => s.active), busy = useFocusStore((s) => s.busy);
  const [discard, setDiscard] = useState(false);
  if (active?.status !== "recovery") return null;
  return <section className="focus-recovery"><h2>确认这次未结束的专注</h2><p>{active.taskTitle} · 已确认 {focusTime(active.actualSeconds)}</p><p className="focus-muted">最后确认于 {new Date(active.checkpointAt).toLocaleString()}。离开期间暂未计入，确认后保持暂停。</p><div className="focus-actions"><button className="focus-primary" disabled={busy} onClick={() => void useFocusStore.getState().perform({ action: "recover", recoveryChoice: "exclude" })}>不计入离开时间</button><button disabled={busy} onClick={() => void useFocusStore.getState().perform({ action: "recover", recoveryChoice: "include" })}>全部计入</button><button onClick={() => setDiscard(true)}>丢弃此记录</button></div><p className="focus-muted">需要精确调整：先排除离开时间并结束，再编辑记录。</p><Dialog open={discard} title="丢弃未结束记录" onClose={() => setDiscard(false)}><p>这会删除本次已确认投入，无法恢复。</p><button disabled={busy} onClick={() => void useFocusStore.getState().perform({ action: "recover", recoveryChoice: "discard" }).then((ok) => { if (ok) setDiscard(false); })}>确认丢弃</button></Dialog></section>;
}

export function FocusFinishPanel() {
  const active = useFocusStore((s) => s.active), open = useFocusStore((s) => s.finishOpen), busy = useFocusStore((s) => s.busy);
  const note = useFocusStore((s) => s.noteDraft), next = useFocusStore((s) => s.nextDraft);
  const [complete, setComplete] = useState(false), panel = useRef<HTMLElement>(null);
  useOverlayFocus(open, panel);
  useEffect(() => { if (open) setComplete(false); }, [open]);
  if (!open || !active) return null;
  return <section ref={panel} role="dialog" aria-label="结束本次专注" className="focus-finish" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.stopPropagation(); void useFocusStore.getState().closeFinish(); }
  }}><form onSubmit={(event) => { event.preventDefault(); void useFocusStore.getState().perform({ action: "finish", note, nextAction: next, completeTask: complete }).then((ok) => { if (ok) { void useTaskStore.getState().load(); void evaluateAndNotify(); } }); }}>
    <h2>保存这次投入</h2><p>{active.taskTitle} · {focusTime(active.actualSeconds)}</p>
    <button className="focus-primary" disabled={busy}>{busy ? "正在保存…" : "完成 Session"}</button>
    {active.taskId != null && <label className="focus-check"><input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />同时完成任务</label>}
    <label>本次备注（可选）<textarea rows={2} value={note} onChange={(e) => useFocusStore.getState().setDraft("noteDraft", e.target.value)} /></label>
    <label>下一步（可选）<input value={next} onChange={(e) => useFocusStore.getState().setDraft("nextDraft", e.target.value)} /></label>
    <FocusError /><button type="button" disabled={busy} onClick={() => void useFocusStore.getState().closeFinish()}>返回专注</button>
  </form></section>;
}
export function FocusSwitchDialog() {
  const taskId = useFocusStore((s) => s.switchTaskId), active = useFocusStore((s) => s.active), busy = useFocusStore((s) => s.busy);
  return <Dialog open={taskId !== undefined} title="切换专注任务" onClose={() => { if (!busy) useFocusStore.getState().cancelSwitch(); }}><p>将保存「{active?.taskTitle}」的已投入时间，然后立即开始所选任务。</p><FocusError /><div className="focus-actions"><button disabled={busy} className="focus-primary" onClick={() => void useFocusStore.getState().confirmSwitch()}>保存并切换</button><button disabled={busy} onClick={() => useFocusStore.getState().cancelSwitch()}>取消</button></div></Dialog>;
}

export default function FocusController({ mini = false }: { mini?: boolean }) {
  const active = useFocusStore((s) => s.active), open = useFocusStore((s) => s.finishOpen), error = useFocusStore((s) => s.error);
  const bar = useRef<HTMLElement>(null), drag = useWindowDrag();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const clamp = (x: number, y: number) => ({ x: Math.max(8, Math.min(x, window.innerWidth - (bar.current?.offsetWidth ?? 0) - 8)), y: Math.max(8, Math.min(y, window.innerHeight - (bar.current?.offsetHeight ?? 0) - 8)) });
  useEffect(() => {
    const resize = () => setPosition((p) => p ? clamp(p.x, p.y) : null);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return <><FocusFinishPanel /><FocusSwitchDialog />{active && !open && <aside ref={bar} style={!mini && position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined} className={mini ? "focus-mini" : "focus-controller"} aria-label="当前专注">{!mini && <button className="focus-drag" aria-label="移动专注条" title="拖动调整位置；方向键移动，Home 复位" onMouseDown={(event) => {
    if (event.button !== 0 || !bar.current) return;
    event.preventDefault(); const rect = bar.current.getBoundingClientRect(), before = position, x = event.clientX, y = event.clientY;
    drag.start({ onMove: (move) => setPosition(clamp(rect.left + move.clientX - x, rect.top + move.clientY - y)), onUp: () => {} }, () => setPosition(before));
  }} onKeyDown={(event) => {
    if (event.key === "Home") { event.preventDefault(); setPosition(null); return; }
    const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
    if (!delta || !bar.current) return;
    event.preventDefault(); const rect = bar.current.getBoundingClientRect(); setPosition(clamp(rect.left + delta[0], rect.top + delta[1]));
  }}><GripVertical size={16} /></button>}<button className="focus-controller-title" onClick={() => useAppStore.getState().setPage("focus")}>{active.taskTitle}<span className="focus-muted">{active.status === "recovery" ? "需要确认恢复" : active.status === "paused" ? "已暂停" : "专注中"}</span></button><FocusClock record={active} /><FocusControls />{mini && <FocusRecovery />}{error && <FocusError />}</aside>}{!active && error && <aside className="focus-controller"><FocusError /></aside>}</>;
}
