import { useState, type ReactNode } from "react";
export function duration(minutes: number) {
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)} 小时${rounded % 60 ? ` ${rounded % 60} 分钟` : ""}` : `${rounded} 分钟`;
}
export const lifecycleLabels: Record<string, string> = { idea: "想法", not_started: "未开始", preparation: "准备中", ready: "待启动", active: "进行中", paused: "已暂停", completed: "已完成", archived: "已归档" };
export function Tabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <div role="tablist" aria-label={label} className="pw-tabs">{options.map((option, index) => <button key={option} role="tab" aria-selected={value === option} tabIndex={value === option ? 0 : -1} onClick={() => onChange(option)} onKeyDown={(event) => {
    const next = event.key === "ArrowRight" ? (index + 1) % options.length : event.key === "ArrowLeft" ? (index + options.length - 1) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
    if (next != null) { event.preventDefault(); onChange(options[next]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus(); }
  }}>{option}</button>)}</div>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="pw-field"><span>{label}</span>{children}</label>; }
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const run = async (work: () => Promise<unknown>, success = "已保存") => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(success); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败，请重试"); return false; }
    finally { setBusy(false); }
  };
  return { busy, run, message: <>{error && <p role="alert" className="pw-error">{error}</p>}{notice && <p role="status" className="pw-notice">{notice}</p>}</> };
}
