import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import {
  getMonthGrid,
  monthLabel,
  WEEKDAY_LABELS,
} from "../../lib/calendar";
import { dateStringToStart, todayString, startOfWeek, dateStringOf } from "../../lib/date";

export interface CalendarPopoverProps {
  selectedDate: string;
  onSelect: (date: string) => void;
  /** 触发按钮显示的文本（如「今日」/「8月25日 星期二」） */
  label: ReactNode;
}

/** YYYY-MM-DD 平移 n 天。 */
function shiftYmd(ymd: string, n: number): string {
  const ts = dateStringToStart(ymd);
  if (Number.isNaN(ts)) return ymd;
  return dateStringOf(ts + n * 86_400_000);
}

function monthStartYmd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** 历史快捷跳转项（昨天/今天/明天/本周/上周/本月）。 */
const QUICK_ITEMS: { label: string; date: string }[] = [
  { label: "昨天", date: shiftYmd(todayString(), -1) },
  { label: "今天", date: todayString() },
  { label: "明天", date: shiftYmd(todayString(), 1) },
  { label: "本周", date: dateStringOf(startOfWeek()) },
  { label: "上周", date: dateStringOf(startOfWeek() - 7 * 86_400_000) },
  { label: "本月", date: monthStartYmd(Date.now()) },
];

/** 轻量日历 popover：点击标题弹出月历，选择日期 / 切换月份 / 返回今天。 */
export default function CalendarPopover({ selectedDate, onSelect, label }: CalendarPopoverProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);

  function openPanel() {
    const ts = dateStringToStart(selectedDate);
    const d = Number.isNaN(ts) ? new Date() : new Date(ts);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  return (
    <div className="relative">
      <button
        onClick={openPanel}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xl font-semibold text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30"
      >
        {label}
        <ChevronDown size={16} className="text-neutral-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
            {/* 历史快捷跳转（v1.7 History） */}
            <div className="mb-2 grid grid-cols-6 gap-1">
              {QUICK_ITEMS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => {
                    onSelect(q.date);
                    setOpen(false);
                  }}
                  className={`rounded px-1 py-1 text-xs transition-colors ${
                    q.date === selectedDate
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="上个月"
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-neutral-900">
                {monthLabel(viewYear, viewMonth)}
              </span>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="下个月"
                className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs text-neutral-400">
              {WEEKDAY_LABELS.map((w) => (
                <span key={w} className="py-1">
                  {w}
                </span>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-0.5">
              {getMonthGrid(viewYear, viewMonth).map((cell) => {
                const selected = cell.date === selectedDate;
                return (
                  <button
                    key={cell.date}
                    onClick={() => {
                      onSelect(cell.date);
                      setOpen(false);
                    }}
                    className={`flex h-8 items-center justify-center rounded text-sm transition-colors ${
                      selected
                        ? "bg-neutral-900 font-medium text-white"
                        : cell.isToday
                          ? "font-semibold text-neutral-900 ring-1 ring-inset ring-neutral-300"
                          : cell.inMonth
                            ? "text-neutral-700 hover:bg-neutral-100"
                            : "text-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                onSelect(todayString());
                setOpen(false);
              }}
              className="mt-2 w-full rounded-md border border-neutral-200 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
            >
              返回今天
            </button>
          </div>
        </>
      )}
    </div>
  );
}
