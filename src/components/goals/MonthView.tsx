import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import {
  weekDayNames,
  monthGrid,
  monthLabel,
  segmentInWeek,
  assignLanes,
  overflowCounts,
  shiftDateRange,
  parseDateKey,
  dateKey,
  type WeekStart,
  type MonthGridWeek,
  type WeekSegment,
} from "../../lib/monthView";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";
import { goalColor } from "../../lib/goalColors";

/** 每行最多同时展示的轨道数，超出走「+N 更多」折叠（保证周行高度有上限）。 */
const MAX_LANES = 3;
const HEADER_H = 22; // 日号区高度
const BAR_H = 20; // 任务条高（v2.3.x 加粗）
const BAR_GAP = 4; // 轨道间距
const FOOTER_H = 18; // +N 折叠行高

function addDaysKey(date: string, delta: number): string {
  const d = parseDateKey(date);
  if (!d) return date;
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

interface MonthViewProps {
  goals: GoalWithProgress[];
  onEdit: (goal: GoalWithProgress) => void;
  onMoveRange: (goalId: number, startDate: string, endDate: string) => void;
  onRequestCreate: (startDate: string, endDate: string) => void;
}

interface RowSeg {
  seg: WeekSegment;
  goal: GoalWithProgress;
}

/**
 * 长期月视图（v1.6.2）：7 列 × 4~6 行真实月历网格。
 * - 周一为首、补位相邻月日期；整月默认一屏可见，无横向滚动；
 * - 日期格 = 一个自然日；今天琥珀高亮、周末浅底、邻月弱化；
 * - 跨日期任务按周行拆段（同属一个任务），行内 Lane 轨道防重叠，
 *   超 MAX_LANES 的溢出按日折叠为「+N 更多」；
 * - 拖动整段按天平移、拖真实起止边缘按天调整（日级 snap，预览 + 松手一次保存）；
 * - 点空白日期格 → 新建（开始=结束=当日）；格内拖动可一次圈选多日新建；
 * - 单击任务段打开编辑弹窗。
 */
export default function MonthView({ goals, onEdit, onMoveRange, onRequestCreate }: MonthViewProps) {
  const now = new Date();
  const todayKey = dateKey(now);
  const weekStart: WeekStart = useSettingsStore((s) => s.settings.weekStart);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const { start: startWindowDrag } = useWindowDrag();
  const gridRef = useRef<HTMLDivElement | null>(null);

  /** 拖动中的目标日期预览（不落库，松手一次提交 = 一次 Undo） */
  const [segPreview, setSegPreview] = useState<{ goalId: number; start: string; end: string } | null>(null);
  /** 空白格圈选新建的日期范围预览 */
  const [rangePreview, setRangePreview] = useState<{ start: string; end: string } | null>(null);
  /** 「+N 更多」展开的日期 */
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  /** 是否已发生真实拖动（>4px），抑制拖动后的 click 误触编辑 */
  const movedRef = useRef(false);

  const weeks = monthGrid(year, month, todayKey, weekStart);
  const arranged = goals.filter((g) => g.startDate && g.deadline);
  const unscheduled = goals.filter((g) => !g.startDate || !g.deadline);

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSegPreview(null);
    setRangePreview(null);
    setDayDetail(null);
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSegPreview(null);
    setRangePreview(null);
    setDayDetail(null);
  };

  /** 拖动预览态下的渲染日期（拖动目标以预览日期替代，行内段随预览实时重排）。 */
  const renderGoals: GoalWithProgress[] = segPreview
    ? goals.map((g) =>
        g.id === segPreview.goalId
          ? { ...g, startDate: segPreview.start, deadline: segPreview.end }
          : g,
      )
    : goals;

  /** 每周行的段 + Lane + 日溢出（含拖动预览，跨周自动拆段）。 */
  function weekSegs(week: MonthGridWeek): { rows: RowSeg[]; laneOf: number[]; overflow: number[] } {
    const rows: RowSeg[] = [];
    for (const g of renderGoals) {
      if (!g.startDate || !g.deadline) continue;
      const seg = segmentInWeek(
        {
          id: g.id,
          title: g.title,
          startDate: g.startDate,
          endDate: g.deadline,
          progressPercent: g.progressPercent,
        },
        year,
        month,
        week,
      );
      if (seg) rows.push({ seg, goal: g });
    }
    const laneOf = assignLanes(rows.map((r) => r.seg));
    const overflow = overflowCounts(rows.map((r) => r.seg), laneOf, MAX_LANES);
    return { rows, laneOf, overflow };
  }

  const cellWidth = () => {
    const w = gridRef.current?.clientWidth ?? 7 * 56;
    return w / 7;
  };

  const colAtX = (clientX: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const c = Math.floor((clientX - rect.left) / cellWidth());
    return Math.max(0, Math.min(6, c));
  };

  /** 拖动整段 / 调整真实起止边缘：本地预览 + 松手一次提交（单次 Undo）。 */
  function startSegDrag(e: React.MouseEvent, row: RowSeg, mode: "move" | "start" | "end") {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    movedRef.current = false;
    const goal = row.goal;
    const origStart = goal.startDate!;
    const origEnd = goal.deadline!;
    const startX = e.clientX;
    let dragging = false;
    let lastDelta = 0;
    startWindowDrag(
      {
        onMove: (ev) => {
          const dx = ev.clientX - startX;
          if (!dragging && Math.abs(dx) <= 4) return;
          dragging = true;
          movedRef.current = true;
          const delta = Math.round(dx / cellWidth());
          if (delta === lastDelta) return;
          lastDelta = delta;
          if (mode === "move") {
            const r = shiftDateRange(origStart, origEnd, delta);
            if (r) setSegPreview({ goalId: goal.id, start: r.startDate, end: r.endDate });
          } else if (mode === "start") {
            const ns = addDaysKey(origStart, delta);
            if (ns < origEnd) setSegPreview({ goalId: goal.id, start: ns, end: origEnd });
          } else {
            const ne = addDaysKey(origEnd, delta);
            if (ne > origStart) setSegPreview({ goalId: goal.id, start: origStart, end: ne });
          }
        },
        onUp: () => {
          if (!dragging) return;
          const delta = lastDelta;
          if (mode === "move") {
            const r = shiftDateRange(origStart, origEnd, delta);
            if (r) onMoveRange(goal.id, r.startDate, r.endDate);
          } else if (mode === "start") {
            const ns = addDaysKey(origStart, delta);
            if (ns < origEnd) onMoveRange(goal.id, ns, origEnd);
          } else {
            const ne = addDaysKey(origEnd, delta);
            if (ne > origStart) onMoveRange(goal.id, origStart, ne);
          }
          setSegPreview(null);
        },
      },
      () => setSegPreview(null),
    );
  }

  /** 空白日期格：点击 → 新建当日；拖动 → 圈选同行多日新建。 */
  function startDayDrag(e: React.MouseEvent, week: MonthGridWeek, col: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    movedRef.current = false;
    const startDate = week.cells[col].date;
    const startX = e.clientX;
    let moved = false;
    startWindowDrag(
      {
        onMove: (ev) => {
          const dx = ev.clientX - startX;
          if (!moved && Math.abs(dx) <= 4) return;
          moved = true;
          const c = colAtX(ev.clientX);
          const d = addDaysKey(week.startDate, c);
          const [s, en] = startDate <= d ? [startDate, d] : [d, startDate];
          setRangePreview({ start: s, end: en });
        },
        onUp: (ev) => {
          setRangePreview(null);
          if (!moved) {
            onRequestCreate(startDate, startDate);
            return;
          }
          const c = colAtX(ev.clientX);
          const d = addDaysKey(week.startDate, c);
          const [s, en] = startDate <= d ? [startDate, d] : [d, startDate];
          onRequestCreate(s, en);
        },
      },
      () => setRangePreview(null),
    );
  }

  const dayGoals = (date: string): GoalWithProgress[] =>
    arranged.filter((g) => g.startDate! <= date && date <= g.deadline!);

  const detailGoals = dayDetail ? dayGoals(dayDetail) : [];

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

      {/* 周表头 */}
      <div className="flex rounded-t-md border border-b-0 border-neutral-200 bg-white">
        {weekDayNames(weekStart).map((w) => (
          <div
            key={w}
            className="flex-1 border-l border-neutral-100 py-1 text-center text-xs font-medium text-neutral-500 first:border-l-0"
          >
            {w}
          </div>
        ))}
      </div>

      {/* 月历网格：7 列 × 4~6 行，整月一屏可见（无横向滚动） */}
      <div
        ref={gridRef}
        className="relative overflow-hidden rounded-b-md border border-neutral-200 bg-white select-none"
      >
        {weeks.map((week, wi) => {
          const { rows, laneOf, overflow } = weekSegs(week);
          const visibleIdx = rows.map((_, i) => i).filter((i) => laneOf[i] < MAX_LANES);
          const laneCount =
            visibleIdx.length > 0 ? Math.max(...visibleIdx.map((i) => laneOf[i])) + 1 : 0;
          const hasOverflow = overflow.some((n) => n > 0);
          const effLanes = hasOverflow ? MAX_LANES : laneCount;
          const rowH = HEADER_H + effLanes * (BAR_H + BAR_GAP) + (hasOverflow ? FOOTER_H + 2 : 4);
          return (
            <div
              key={wi}
              className="relative border-t border-neutral-200 first:border-t-0"
              style={{ height: rowH }}
            >
              {/* 日期列背景 + 日号（今天/周末/邻月/圈选高亮） */}
              <div className="absolute inset-0 flex">
                {week.cells.map((c, ci) => {
                  const inRange =
                    rangePreview !== null &&
                    c.date >= rangePreview.start &&
                    c.date <= rangePreview.end;
                  return (
                    <div
                      key={c.date}
                      onMouseDown={(e) => startDayDrag(e, week, ci)}
                      className={`relative flex-1 cursor-pointer border-l border-neutral-100 first:border-l-0 ${
                        c.isToday ? "bg-amber-50" : c.isWeekend ? "bg-neutral-50" : ""
                      } ${c.inMonth ? "" : "bg-neutral-50/50"} ${
                        inRange ? "bg-amber-100/80 ring-1 ring-inset ring-amber-300" : ""
                      }`}
                      style={{ height: rowH }}
                    >
                      <div
                        className={`pt-1 text-center text-xs font-medium ${
                          c.isToday
                            ? "text-amber-700"
                            : c.inMonth
                              ? "text-neutral-700"
                              : "text-neutral-300"
                        }`}
                      >
                        {c.day}
                        {c.isToday && <span className="ml-0.5 text-[10px]">今</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 任务段（按 Lane 定位，% 宽对齐日期列；跨周自动拆段） */}
              {visibleIdx.map((i) => {
                const { seg, goal } = rows[i];
                const lane = laneOf[i];
                const color = goalColor(goal.id);
                return (
                  <div
                    key={`${seg.goalId}-${wi}`}
                    onMouseDown={(e) => startSegDrag(e, rows[i], "move")}
                    onClick={() => {
                      if (movedRef.current) {
                        movedRef.current = false;
                        return;
                      }
                      onEdit(goal);
                    }}
                    aria-label="编辑长期任务"
                    title={`${goal.title}：${goal.startDate} ~ ${goal.deadline}（拖动移动，边缘调整起止）`}
                    className="absolute z-10 flex cursor-grab items-center overflow-hidden rounded-[4px] transition-[filter] hover:brightness-[0.96] active:cursor-grabbing"
                    style={{
                      left: `${(seg.startCol / 7) * 100}%`,
                      width: `${((seg.endCol - seg.startCol + 1) / 7) * 100}%`,
                      top: HEADER_H + lane * (BAR_H + BAR_GAP) + 1,
                      height: BAR_H - 2,
                      backgroundColor: `${color}24`,
                      borderLeft: `3px solid ${color}`,
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)",
                    }}
                  >
                    {/* 进度：同色加深填充（饱和度略高，保持与底色的色相一致） */}
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${seg.progressPercent}%`, backgroundColor: `${color}47` }}
                    />
                    {seg.startsGoal && (
                      <div
                        onMouseDown={(e) => startSegDrag(e, rows[i], "start")}
                        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize"
                        title="拖动调整开始日期"
                      />
                    )}
                    {seg.endsGoal && (
                      <div
                        onMouseDown={(e) => startSegDrag(e, rows[i], "end")}
                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize"
                        title="拖动调整结束日期"
                      />
                    )}
                    <span className="relative z-10 truncate pl-1.5 pr-1 text-[11px] font-medium leading-none text-neutral-800">
                      {seg.title}
                    </span>
                  </div>
                );
              })}

              {/* 每日溢出折叠：「+N 更多」 */}
              {overflow.map((n, ci) =>
                n > 0 ? (
                  <button
                    key={`${week.cells[ci].date}-more`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayDetail(week.cells[ci].date);
                    }}
                    className="absolute z-10 cursor-pointer rounded px-1 text-center text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    style={{
                      left: `${(ci / 7) * 100}%`,
                      width: `${100 / 7}%`,
                      top: HEADER_H + MAX_LANES * (BAR_H + BAR_GAP) + 1,
                      height: FOOTER_H,
                    }}
                  >
                    +{n} 更多
                  </button>
                ) : null,
              )}
            </div>
          );
        })}

        {/* 空月提示：无任何排期任务时引导点击日期新建 */}
        {arranged.length === 0 && unscheduled.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-neutral-400">
            本月暂无排期任务，点击任意日期新建
          </div>
        )}
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
                className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 hover:border-neutral-300"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: goalColor(g.id) }}
                />
                {g.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 「+N 更多」当日任务列表 */}
      {dayDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={() => setDayDetail(null)}
        >
          <div
            className="w-80 rounded-lg bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">
              {dayDetail}（{detailGoals.length} 项）
            </h3>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {detailGoals.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setDayDetail(null);
                    onEdit(g);
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-neutral-100 px-2 py-1.5 text-left text-xs hover:bg-neutral-50"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: goalColor(g.id) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-neutral-800">{g.title}</span>
                  <span className="shrink-0 text-neutral-400">
                    {g.startDate?.slice(5)}~{g.deadline?.slice(5)}
                  </span>
                  <span className="shrink-0 font-medium text-neutral-600">{g.progressPercent}%</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const d = dayDetail;
                setDayDetail(null);
                onRequestCreate(d, d);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-neutral-200 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              <Plus size={12} /> 在此日新建长期任务
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
