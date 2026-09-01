import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import {
  buildMonthGrid,
  monthLabel,
  spanInGrid,
  shiftDateRange,
  dateKey,
} from "../../lib/monthView";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface MonthViewProps {
  goals: GoalWithProgress[];
  /** 点击任务块 → 编辑该目标 */
  onEdit: (goal: GoalWithProgress) => void;
  /** 拖动/调整日期范围后回写 */
  onMoveRange: (goalId: number, startDate: string, endDate: string) => void;
}

/**
 * 长期月视图（V2）：月份网格 + 跨天任务块。
 * - 任务块按 startDate ~ deadline 跨天渲染（连续，不按天复制）；
 * - 拖动整块 → 整体平移；拖动左/右边缘 → 调整开始/结束日期；
 * - 点击块 → 编辑；无日期范围的目标归入「未安排」。
 * 复用 useWindowDrag（与今日时间轴一致的鼠标拖拽方案）。
 */
export default function MonthView({ goals, onEdit, onMoveRange }: MonthViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const trackRef = useRef<HTMLDivElement>(null);
  const { start: startWindowDrag } = useWindowDrag();

  const cells = buildMonthGrid(year, month);
  const n = cells.length;
  const colW = () => (trackRef.current ? trackRef.current.getBoundingClientRect().width / n : 1);

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

  /** 按水平位移把日期范围平移 deltaDays 天并回写。 */
  function dragBlock(e: React.MouseEvent, goal: GoalWithProgress, mode: "move" | "start" | "end") {
    e.stopPropagation();
    // 注意：不 preventDefault，否则会抑制随后的 click（点击块应打开编辑）。
    const startX = e.clientX;
    let dragging = false;
    let lastDelta = 0;
    startWindowDrag(
      {
        onMove: (ev) => {
          const dx = ev.clientX - startX;
          if (!dragging && Math.abs(dx) < 4) return;
          dragging = true;
          const deltaDays = Math.round(dx / colW());
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
          /* 松手即保存（onMove 已回写） */
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

      {/* 表头 */}
      <div className="flex">
        <div className="w-32 shrink-0" />
        <div className="grid flex-1 grid-cols-7 text-center text-xs text-neutral-500">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      </div>

      {/* 任务行 */}
      <div className="space-y-2">
        {arranged.length === 0 && unscheduled.length === 0 && (
          <p className="py-4 text-center text-sm text-neutral-400">暂无长期任务</p>
        )}
        {arranged.map((g) => {
          const span = spanInGrid(g.startDate, g.deadline, cells);
          return (
            <div key={g.id} className="flex items-center gap-2">
              <div
                className="w-32 shrink-0 truncate text-right text-xs text-neutral-600"
                title={g.title}
              >
                {g.title}
              </div>
              <div ref={trackRef} className="relative h-7 flex-1 rounded bg-neutral-100">
                {/* 周分隔线 */}
                <div className="absolute inset-0 grid grid-cols-7">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="border-r border-neutral-200 last:border-r-0" />
                  ))}
                </div>
                {span && (
                  <div
                    onMouseDown={(e) => dragBlock(e, g, "move")}
                    onClick={() => onEdit(g)}
                    aria-label="编辑长期任务"
                    className="absolute top-1 bottom-1 flex cursor-grab items-center overflow-hidden rounded bg-neutral-900/15 hover:bg-neutral-900/25 active:cursor-grabbing"
                    style={{
                      left: `${(span.startIndex / n) * 100}%`,
                      width: `${((span.endIndex - span.startIndex + 1) / n) * 100}%`,
                    }}
                    title={`${g.title}：${g.startDate} ~ ${g.deadline}（拖动移动）`}
                  >
                    {/* 进度填充 */}
                    <div
                      className="absolute inset-y-0 left-0 bg-neutral-900/70"
                      style={{ width: `${g.progressPercent}%` }}
                    />
                    {/* 左边缘（调整开始日期） */}
                    <div
                      onMouseDown={(e) => dragBlock(e, g, "start")}
                      className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize"
                      title="拖动调整开始日期"
                    />
                    {/* 右边缘（调整结束日期） */}
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
            </div>
          );
        })}
      </div>

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
