import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import {
  monthDays,
  monthLabel,
  daySpanInMonth,
  shiftDateRange,
  dateKey,
} from "../../lib/monthView";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";

/** 每日期列宽度（px）：统一宽度，任务块按日偏移严格对齐。 */
const DAY_COLUMN_WIDTH = 56;

interface MonthViewProps {
  goals: GoalWithProgress[];
  onEdit: (goal: GoalWithProgress) => void;
  onMoveRange: (goalId: number, startDate: string, endDate: string) => void;
}

/**
 * 长期月视图（v1.6）：月度日时间轴。
 * - 当月每天一个独立日期列（1..30/31，非 7 列周视图），每列显示 日号 + 星期；
 * - 今天高亮、周末浅底；左侧任务名固定，右侧横向滚动；
 * - 任务块按 日偏移×日宽 定位、宽度=跨天数×日宽，跨月任务裁剪到月边界；
 * - 拖动整块按天平移、拖边缘按天调整起止（日级 snap）。
 */
export default function MonthView({ goals, onEdit, onMoveRange }: MonthViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const { start: startWindowDrag } = useWindowDrag();

  const cells = monthDays(year, month);
  const n = cells.length;
  const trackWidth = n * DAY_COLUMN_WIDTH;

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const arranged = goals.filter((g) => g.startDate && g.deadline);
  const unscheduled = goals.filter((g) => !g.startDate || !g.deadline);

  /** 按水平位移（日列宽换算）平移/调整日期范围，日级 snap。 */
  function dragBlock(e: React.MouseEvent, goal: GoalWithProgress, mode: "move" | "start" | "end") {
    e.stopPropagation();
    const startX = e.clientX;
    let dragging = false;
    let lastDelta = 0;
    startWindowDrag(
      {
        onMove: (ev) => {
          const dx = ev.clientX - startX;
          if (!dragging && Math.abs(dx) < 4) return;
          dragging = true;
          const deltaDays = Math.round(dx / DAY_COLUMN_WIDTH);
          if (deltaDays === lastDelta) return;
          lastDelta = deltaDays;
          if (mode === "move") {
            const r = shiftDateRange(goal.startDate, goal.deadline, deltaDays);
            if (r) onMoveRange(goal.id, r.startDate, r.endDate);
          } else if (mode === "start") {
            const s = new Date(goal.startDate!);
            s.setDate(s.getDate() + deltaDays);
            const ns = dateKey(s);
            if (ns < goal.deadline!) onMoveRange(goal.id, ns, goal.deadline!);
          } else {
            const en = new Date(goal.deadline!);
            en.setDate(en.getDate() + deltaDays);
            const ne = dateKey(en);
            if (ne > goal.startDate!) onMoveRange(goal.id, goal.startDate!, ne);
          }
        },
        onUp: () => {
          /* 松手即保存 */
        },
      },
      () => {
        /* 中断无需处理 */
      },
    );
  }

  return (
    <div className="space-y-3">
      {/* 月份导航 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => goMonth(-1)}
          aria-label="上个月"
          className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-28 text-center text-sm font-medium text-neutral-900">
          {monthLabel(year, month)}
        </span>
        <button
          onClick={() => goMonth(1)}
          aria-label="下个月"
          className="rounded-md border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-100"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={goToday}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          本月
        </button>
      </div>

      {arranged.length === 0 && unscheduled.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-400">暂无长期任务</p>
      ) : (
        <div className="flex rounded-md border border-neutral-200">
          {/* 左侧固定：任务名 */}
          <div className="w-28 shrink-0 border-r border-neutral-100">
            <div className="flex h-9 items-end px-2 pb-1 text-[10px] text-neutral-400">任务</div>
            {arranged.map((g) => (
              <div
                key={g.id}
                className="flex h-9 items-center truncate px-2 text-xs text-neutral-600"
                title={g.title}
              >
                {g.title}
              </div>
            ))}
          </div>

          {/* 右侧可横向滚动：日期表头 + 任务行（共用同一滚动容器，保证对齐） */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ width: trackWidth }}>
              {/* 日期表头：日号 + 星期；今天高亮、周末浅底 */}
              <div className="flex h-9 border-b border-neutral-100">
                {cells.map((c) => (
                  <div
                    key={c.date}
                    className={`shrink-0 border-l border-neutral-100 first:border-l-0 ${
                      c.isToday ? "bg-amber-50" : ""
                    } ${
                      !c.isToday && (c.weekday === "周六" || c.weekday === "周日")
                        ? "bg-neutral-50"
                        : ""
                    }`}
                    style={{ width: DAY_COLUMN_WIDTH }}
                  >
                    <div
                      className={`pt-1 text-center text-xs font-medium ${
                        c.isToday ? "text-amber-700" : "text-neutral-700"
                      }`}
                    >
                      {c.day}
                      {c.isToday && <span className="ml-0.5 text-[10px]">今</span>}
                    </div>
                    <div className="text-center text-[10px] text-neutral-400">{c.weekday}</div>
                  </div>
                ))}
              </div>

              {/* 任务行 */}
              {arranged.map((g) => {
                const span = daySpanInMonth(g.startDate, g.deadline, year, month);
                return (
                  <div key={g.id} className="relative flex h-9 border-t border-neutral-100">
                    {/* 日列背景：周末浅底 + 今天列 */}
                    <div className="absolute inset-0 flex">
                      {cells.map((c) => (
                        <div
                          key={c.date}
                          className={`shrink-0 border-l border-neutral-100 first:border-l-0 ${
                            c.isToday
                              ? "bg-amber-50/60"
                              : c.weekday === "周六" || c.weekday === "周日"
                                ? "bg-neutral-50"
                                : ""
                          }`}
                          style={{ width: DAY_COLUMN_WIDTH }}
                        />
                      ))}
                    </div>
                    {span && (
                      <div
                        onMouseDown={(e) => dragBlock(e, g, "move")}
                        onClick={() => onEdit(g)}
                        aria-label="编辑长期任务"
                        className="absolute top-1 bottom-1 z-10 flex cursor-grab items-center overflow-hidden rounded bg-neutral-900/15 hover:bg-neutral-900/25 active:cursor-grabbing"
                        style={{
                          left: (span.start - 1) * DAY_COLUMN_WIDTH,
                          width: (span.end - span.start + 1) * DAY_COLUMN_WIDTH,
                        }}
                        title={`${g.title}：${g.startDate} ~ ${g.deadline}（拖动移动）`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-neutral-900/70"
                          style={{ width: `${g.progressPercent}%` }}
                        />
                        <div
                          onMouseDown={(e) => dragBlock(e, g, "start")}
                          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize"
                          title="拖动调整开始日期"
                        />
                        <div
                          onMouseDown={(e) => dragBlock(e, g, "end")}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize"
                          title="拖动调整结束日期"
                        />
                        <span className="relative z-10 truncate px-2 text-[10px] text-neutral-900">
                          {g.title}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 未安排（无日期范围） */}
      {unscheduled.length > 0 && (
        <div className="rounded-md border border-dashed border-neutral-200 p-3">
          <div className="mb-1 text-xs text-neutral-400">未安排日期</div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((g) => (
              <button
                key={g.id}
                onClick={() => onEdit(g)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:border-neutral-300"
              >
                {g.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
