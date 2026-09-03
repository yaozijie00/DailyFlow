import { useEffect, useMemo, useRef, useState } from "react";
import { Zap, CalendarDays, Clock } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { parseQuickCapture } from "../../lib/quickCapture";
import { todayString } from "../../lib/date";

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 快速捕获（v1.6.2 优化）：Ctrl/Cmd+Shift+I 呼出，一行自然语言创建任务：
 * `明天 14:00 1.5h #开发 写设计文档`；回车创建（可撤销），Esc 关闭。
 * 实时显示解析结果预览。
 */
export default function QuickCapture() {
  const categories = useTaskStore((s) => s.categories);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => {
    if (q.trim() === "") return null;
    return parseQuickCapture(q, { today: todayString(), categories });
  }, [q, categories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQ("");
  };

  const submit = async () => {
    const r = parsed;
    if (!r) return;
    const ok = await useTaskStore.getState().createScheduledTask({
      title: r.title,
      scheduledDate: r.scheduledDate,
      plannedStart: r.plannedStart,
      plannedEnd: r.plannedEnd,
      estimatedDuration: r.estimatedDuration,
      categoryId: r.categoryId,
    });
    if (ok) close();
  };

  const catName =
    parsed?.categoryId != null
      ? categories.find((c) => c.id === parsed.categoryId)?.name ?? null
      : null;

  return (
    <div
      className="fixed inset-0 z-[92] flex items-start justify-center bg-black/30 pt-[18vh]"
      onClick={close}
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
          <Zap size={15} className="shrink-0 text-amber-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="快速捕获：明天 14:00 1.5h #开发 写设计文档（回车创建）"
            className="w-full bg-transparent py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <span className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400">
            Esc
          </span>
        </div>

        <div className="min-h-11 px-3 py-2 text-xs text-neutral-500">
          {parsed ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1 text-amber-700">
                <CalendarDays size={12} />
                {parsed.scheduledDate === todayString()
                  ? "今天"
                  : parsed.scheduledDate.split("-").join("/")}
              </span>
              {parsed.plannedStart != null && parsed.plannedEnd != null && (
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {fmtClock(parsed.plannedStart)}-{fmtClock(parsed.plannedEnd)}
                </span>
              )}
              {parsed.estimatedDuration != null && (
                <span>{Math.round(parsed.estimatedDuration / 60)} 分钟</span>
              )}
              {catName && <span className="text-neutral-600">#{catName}</span>}
              <span className="font-medium text-neutral-800">{parsed.title}</span>
            </div>
          ) : (
            <span className="text-neutral-400">
              例：明天 14:00 1.5h #开发 写设计文档 · 支持 今天/周X/MM-DD/9月28日
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
