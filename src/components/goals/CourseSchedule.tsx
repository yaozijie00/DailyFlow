import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useCourseStore, courseService } from "../../stores/courseStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { startOfWeek, dateStringOf } from "../../lib/date";
import {
  SCHEDULE_WEEKDAYS,
  minutesLabel,
  minutesToPx,
  pxToMinutes,
  snapMinutes,
  isOccupied,
  clampGridStart,
  resizeSlot,
  rowHeightForWindow,
} from "../../lib/schedule";
import { courseColor } from "../../lib/courseColors";
import { NO_CATEGORY_COLOR } from "../../lib/categoryColors";
import type { Course, SlotView } from "../../db/repositories/courseRepository";

/** 点格放置/拖入默认时长（分钟）。 */
const PLACE_DURATION = 60;

interface HoverTarget {
  weekday: number;
  start: number;
  conflict: boolean;
}

interface DragState {
  kind: "library" | "block" | "resize";
  courseId: number | null;
  slotId?: number;
  title: string;
  durationMinutes: number;
  x: number;
  y: number;
  weekday: number | null; // null = 指针在网格外（库拖入＝松开取消）
  start: number | null;
  conflict: boolean;
}

function colorOfCourse(id: number | null | undefined): string {
  return id == null ? NO_CATEGORY_COLOR : courseColor(id);
}

interface WeekProgressRow {
  courseId: number;
  title: string;
  occurrences: number;
  completed: number;
}

/**
 * 课程表（2.0.x Course Schedule，交互与视觉优化）：
 * - 配色：每门课自动稳定色（courseColors），课程库圆点 / 色块 / 图例同色；
 * - 添加：单击课程 → 点空白格放置（带幽灵预览与冲突提示）；或按住课程卡拖入周视图；
 * - 课程块：按住拖动可换天/改时间（15 分钟吸附），全程幽灵预览 + 原块半透明；
 * - 文本选中抑制：网格/库交互区 select-none + 拖拽 preventDefault。
 */
export default function CourseSchedule() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const courses = useCourseStore((s) => s.courses);
  const slots = useCourseStore((s) => s.slots);
  const createCourse = useCourseStore((s) => s.createCourse);
  const deleteCourse = useCourseStore((s) => s.deleteCourse);
  const addSlot = useCourseStore((s) => s.addSlot);
  const moveSlot = useCourseStore((s) => s.moveSlot);
  const deleteSlot = useCourseStore((s) => s.deleteSlot);
  const { start: startWindowDrag } = useWindowDrag();

  const [armedId, setArmedId] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState("");
  const [weekProgress, setWeekProgress] = useState<WeekProgressRow[]>([]);

  const colRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rowDragMovedRef = useRef(false);

  useEffect(() => {
    if (dbStatus === "ready") void useCourseStore.getState().load();
  }, [dbStatus]);

  // 本周课程完成状态（周一 ~ 周日）
  useEffect(() => {
    if (dbStatus !== "ready") return;
    let alive = true;
    const monday = startOfWeek();
    const from = dateStringOf(monday);
    const to = dateStringOf(monday + 6 * 86_400_000);
    void courseService
      .getWeekProgress(from, to)
      .then((rows) => {
        if (alive) setWeekProgress(rows);
      })
      .catch(() => {
        if (alive) setWeekProgress([]);
      });
    return () => {
      alive = false;
    };
  }, [dbStatus, slots]);

  // 放置模式：Esc 取消
  useEffect(() => {
    if (armedId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setArmedId(null);
        setHover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedId]);

  const armedCourse: Course | null =
    armedId == null ? null : (courses.find((c) => c.id === armedId) ?? null);

  // 可视时间窗：跟随「时间轴开始/结束」设置（取整点，保证 end > start）
  const timelineSettings = useSettingsStore((s) => s.settings);
  const gridStartMin = Math.max(0, Math.round(timelineSettings.timelineStartMinutes / 60) * 60);
  const gridEndMin = Math.max(
    gridStartMin + 60,
    Math.min(24 * 60, Math.round(timelineSettings.timelineEndMinutes / 60) * 60),
  );
  const snapStep = Math.max(5, Math.min(60, Math.round(timelineSettings.timelineSnapMinutes || 15)));
  const hourCount = (gridEndMin - gridStartMin) / 60;
  const pxPerHour = rowHeightForWindow(hourCount);
  const startHour = gridStartMin / 60;
  const hours = Array.from({ length: hourCount }, (_, i) => startHour + i);

  /** 列 → 真实 weekday（1=周一..7=周日）：周起始日决定首列（默认周一为首）。 */
  const colWeekdays = useMemo(() => {
    const lead = timelineSettings.weekStart === "sunday" ? 7 : 1;
    return Array.from({ length: 7 }, (_, i) => ((lead - 1 + i) % 7) + 1);
  }, [timelineSettings.weekStart]);

  const daySlotsByWeekday = useMemo(() => {
    const m = new Map<number, SlotView[]>();
    for (let w = 1; w <= 7; w++) m.set(w, []);
    for (const s of slots) {
      const arr = m.get(s.weekday);
      if (arr) arr.push(s);
    }
    m.forEach((arr) => arr.sort((a, b) => a.startMinutes - b.startMinutes));
    return m;
  }, [slots]);

  /** 每门课的每周节数（无 DB 开销，直接从 slots 推导）。 */
  const perCourseCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of slots) {
      if (s.courseId == null) continue;
      m.set(s.courseId, (m.get(s.courseId) ?? 0) + 1);
    }
    return m;
  }, [slots]);

  const submitCourse = () => {
    const t = draft.trim();
    if (!t) return;
    void createCourse(t);
    setDraft("");
  };

  /** 指针 → 命中列与吸附后开始分钟（未命中任何列/超出纵向范围 → null）。 */
  function targetFromPointer(
    x: number,
    y: number,
    durationMinutes: number,
    ignoreId?: number,
  ): { weekday: number; start: number; conflict: boolean } | null {
    const cols = colRefs.current;
    for (let i = 0; i < cols.length; i++) {
      const el = cols[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right) continue;
      if (y < r.top || y > r.bottom) return null;
      const weekday = colWeekdays[i];
      const raw = pxToMinutes(y - r.top, pxPerHour, gridStartMin);
      const start = clampGridStart(
        snapMinutes(raw, snapStep),
        durationMinutes,
        gridStartMin,
        gridEndMin,
      );
      const conflict = isOccupied(slots, weekday, start, durationMinutes, ignoreId);
      return { weekday, start, conflict };
    }
    return null;
  }

  /** 放置模式下的列内悬停目标（基于列自身坐标，默认 60 分钟）。 */
  function hoverAt(e: React.MouseEvent<HTMLDivElement>, weekday: number): HoverTarget | null {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY;
    if (y < r.top || y > r.bottom) return null;
    const raw = pxToMinutes(y - r.top, pxPerHour, gridStartMin);
    const start = clampGridStart(
      snapMinutes(raw, snapStep),
      PLACE_DURATION,
      gridStartMin,
      gridEndMin,
    );
    const conflict = isOccupied(slots, weekday, start, PLACE_DURATION);
    return { weekday, start, conflict };
  }

  function onColumnMove(e: React.MouseEvent<HTMLDivElement>, weekday: number) {
    if (armedCourse == null) return;
    const t = hoverAt(e, weekday);
    if (!t) {
      if (hover?.weekday === weekday) setHover(null);
      return;
    }
    setHover(t);
  }

  function onColumnLeave(weekday: number) {
    if (hover?.weekday === weekday) setHover(null);
  }

  /** 放置模式点击空白列：落格 60 分钟并保持放置模式（可连排）；冲突不落格。 */
  function onColumnMouseDown(e: React.MouseEvent<HTMLDivElement>, weekday: number) {
    if (armedCourse == null || e.button !== 0) return;
    e.preventDefault();
    const t = hoverAt(e, weekday);
    if (!t || t.conflict) return;
    void addSlot(armedCourse.id, weekday, t.start);
  }

  /** 课程库行：按住拖入周视图（>5px 判定为拖；否则交给 click 切换放置模式）。 */
  function onCourseRowMouseDown(e: React.MouseEvent, course: Course) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // 删除等按钮不触发
    rowDragMovedRef.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    startWindowDrag(
      {
        onMove: (ev) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 5) return;
          moved = true;
          rowDragMovedRef.current = true;
          const t = targetFromPointer(ev.clientX, ev.clientY, PLACE_DURATION);
          setDrag({
            kind: "library",
            courseId: course.id,
            title: course.title,
            durationMinutes: PLACE_DURATION,
            x: ev.clientX,
            y: ev.clientY,
            weekday: t ? t.weekday : null,
            start: t ? t.start : null,
            conflict: t ? t.conflict : false,
          });
        },
        onUp: (ev) => {
          if (!moved) return;
          const t = targetFromPointer(ev.clientX, ev.clientY, PLACE_DURATION);
          if (t && !t.conflict) void addSlot(course.id, t.weekday, t.start);
          setDrag(null);
        },
      },
      () => setDrag(null), // Esc / 失焦：取消拖入
    );
  }

  /** 课程块：按住拖动换天/改开始时间（15 分钟吸附，实时幽灵预览）。 */
  function onBlockMouseDown(e: React.MouseEvent, slot: SlotView) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const duration = slot.durationMinutes;
    let moved = false;
    startWindowDrag(
      {
        onMove: (ev) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 4) return;
          moved = true;
          const t = targetFromPointer(ev.clientX, ev.clientY, duration, slot.id);
          if (!t) {
            // 指针在网格外：幽灵消失并提示「松开取消」
            setDrag((prev) =>
              prev && prev.kind === "block" && prev.slotId === slot.id
                ? { ...prev, x: ev.clientX, y: ev.clientY, weekday: null, start: null, conflict: false }
                : prev,
            );
            return;
          }
          setDrag({
            kind: "block",
            courseId: slot.courseId,
            slotId: slot.id,
            title: slot.courseTitle ?? "课程",
            durationMinutes: duration,
            x: ev.clientX,
            y: ev.clientY,
            weekday: t.weekday,
            start: t.start,
            conflict: t.conflict,
          });
        },
        onUp: (ev) => {
          if (!moved) return;
          // 松手位置为准：网格外=取消；网格内无冲突且位置变化才提交
          const t = targetFromPointer(ev.clientX, ev.clientY, duration, slot.id);
          if (
            t &&
            !t.conflict &&
            (t.weekday !== slot.weekday || t.start !== slot.startMinutes)
          ) {
            void moveSlot(slot.id, { weekday: t.weekday, startMinutes: t.start });
          }
          setDrag(null);
        },
      },
      () => setDrag(null), // Esc / 失焦：取消移动
    );
  }

  /** 上下边缘拖拽调整时长（与时间轴任务块一致）：实时幽灵 + 冲突检测，松手提交。 */
  function onResizeMouseDown(e: React.MouseEvent, slot: SlotView, edge: "start" | "end") {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const weekday = slot.weekday;
    const origStart = slot.startMinutes;
    const origDur = slot.durationMinutes;
    const startY = e.clientY;
    let moved = false;
    let last: { start: number; duration: number; conflict: boolean } | null = null;
    startWindowDrag(
      {
        onMove: (ev) => {
          if (!moved && Math.abs(ev.clientY - startY) <= 3) return;
          moved = true;
          const colEl = colRefs.current[weekday - 1];
          if (!colEl) return;
          const r = colEl.getBoundingClientRect();
          const raw = pxToMinutes(ev.clientY - r.top, pxPerHour, gridStartMin);
          const rs = resizeSlot(
            origStart,
            origDur,
            edge,
            snapMinutes(raw, snapStep),
            gridStartMin,
            gridEndMin,
          );
          const conflict = isOccupied(slots, weekday, rs.startMinutes, rs.durationMinutes, slot.id);
          last = { start: rs.startMinutes, duration: rs.durationMinutes, conflict };
          setDrag({
            kind: "resize",
            courseId: slot.courseId,
            slotId: slot.id,
            title: slot.courseTitle ?? "课程",
            durationMinutes: rs.durationMinutes,
            x: ev.clientX,
            y: ev.clientY,
            weekday,
            start: rs.startMinutes,
            conflict,
          });
        },
        onUp: () => {
          if (!moved) return;
          if (
            last &&
            !last.conflict &&
            (last.start !== origStart || last.duration !== origDur)
          ) {
            void moveSlot(slot.id, { startMinutes: last.start, durationMinutes: last.duration });
          }
          setDrag(null);
        },
      },
      () => setDrag(null), // Esc / 失焦：取消调整
    );
  }

  /** 当前「有效预览」：放置悬停 或 进行中的拖拽目标。 */
  const armedHoverGhost =
    !drag && armedCourse && hover
      ? {
          courseId: armedCourse.id,
          title: armedCourse.title,
          durationMinutes: PLACE_DURATION,
          weekday: hover.weekday,
          start: hover.start,
          conflict: hover.conflict,
        }
      : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
        <BookOpen size={15} className="text-neutral-400" />
        课程表
        <span className="text-xs font-normal text-neutral-400">
          每周固定安排 · 单击课程后点空白格添加，或按住课程拖入；拖色块换天/时间，拖上下边调时长
        </span>
      </div>

      {/* 本周完成状态（兼作图例：色点 = 课程色） */}
      {weekProgress.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {weekProgress.map((p) => {
            const color = courseColor(p.courseId);
            const full = p.completed >= p.occurrences;
            return (
              <span
                key={p.courseId}
                title="本周按时完成课程任务数 / 应出现次数"
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-0.5 pl-1.5 pr-2 text-[11px] text-neutral-500"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-medium text-neutral-800">{p.title}</span>
                <span className={full ? "font-semibold text-green-600" : "tabular-nums"}>
                  {p.completed}/{p.occurrences}
                </span>
              </span>
            );
          })}
          <span className="text-[11px] text-neutral-400">本周按节完成</span>
        </div>
      )}

      {/* 布局：左侧 = 周表格视图，右侧 = 我的课程（flex-row-reverse 视觉对调） */}
      <div className="flex flex-row-reverse items-start gap-3">
        {/* 课程库 */}
        <aside className="w-48 shrink-0 select-none space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-700">我的课程</h3>
            {courses.length > 0 && (
              <span className="text-[10px] tabular-nums text-neutral-400">{courses.length}</span>
            )}
          </div>

          {courses.length === 0 ? (
            <p className="text-xs leading-relaxed text-neutral-400">
              还没有课程，先新建一个，再点空白格或拖入排课
            </p>
          ) : (
            <ul className="max-h-[424px] space-y-0.5 overflow-y-auto pr-0.5">
              {courses.map((c) => {
                const color = courseColor(c.id);
                const armed = armedId === c.id;
                const n = perCourseCount.get(c.id) ?? 0;
                return (
                  <li
                    key={c.id}
                    onMouseDown={(e) => onCourseRowMouseDown(e, c)}
                    onClick={() => {
                      if (rowDragMovedRef.current) {
                        rowDragMovedRef.current = false;
                        return;
                      }
                      setArmedId(armed ? null : c.id);
                      setHover(null);
                    }}
                    title={
                      armed
                        ? "已选中：点击左侧表格空白格放置 · 再点一下或按 Esc 取消"
                        : "点击开始放置（点空白格添加 60 分钟）；按住可拖入周视图"
                    }
                    className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors active:cursor-grabbing ${
                      armed ? "" : "hover:bg-neutral-50"
                    }`}
                    style={
                      armed
                        ? {
                            backgroundColor: `${color}14`,
                            boxShadow: `inset 0 0 0 1px ${color}`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">
                      {c.title}
                    </span>
                    {n > 0 && (
                      <span className="shrink-0 text-[10px] tabular-nums text-neutral-400 group-hover:hidden">
                        {n}节
                      </span>
                    )}
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteCourse(c.id);
                      }}
                      aria-label={`删除课程 ${c.title}`}
                      className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCourse();
              }}
              placeholder="新课程名"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
            />
            <button
              onClick={submitCourse}
              disabled={draft.trim().length === 0}
              aria-label="添加课程"
              className="rounded-md bg-neutral-900 px-2 text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200"
            >
              <Plus size={13} />
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-neutral-400">
            单击课程 = 开始放置；按住 = 拖入周视图；Esc 取消
          </p>
        </aside>

        {/* 周课程表 */}
        <div className="min-w-0 flex-1 select-none overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {/* 放置模式提示条 */}
          {armedCourse && !drag && (
            <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/70 px-3 py-1.5 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: courseColor(armedCourse.id) }}
              />
              <span className="text-neutral-700">
                正在添加{" "}
                <span className="font-medium text-neutral-900">{armedCourse.title}</span>
                ：点击左侧表格空白格放置（60 分钟）
              </span>
              <span className="hidden text-neutral-400 sm:inline">· 再点课程 / Esc 取消</span>
              <button
                onClick={() => {
                  setArmedId(null);
                  setHover(null);
                }}
                aria-label="取消放置"
                className="ml-auto rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-700"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* 周几表头 */}
          <div className="flex border-b border-neutral-200">
            <div className="w-11 shrink-0" />
            {colWeekdays.map((weekday) => {
              const active =
                (drag && drag.weekday === weekday) ||
                (!drag && armedCourse && hover?.weekday === weekday);
              return (
                <div
                  key={weekday}
                  className={`min-w-0 flex-1 border-l border-neutral-100 py-1 text-center text-xs font-medium text-neutral-500 first:border-l-0 ${
                    active ? "bg-neutral-100/70" : ""
                  }`}
                >
                  {SCHEDULE_WEEKDAYS[weekday - 1]}
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height: hourCount * pxPerHour }}>
            {/* 时间尺 */}
            <div className="w-11 shrink-0">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-neutral-100 px-1 pt-0.5 text-right text-[10px] tabular-nums text-neutral-400"
                  style={{ height: pxPerHour }}
                >
                  {String(h).padStart(2, "0")}
                </div>
              ))}
            </div>

            {/* 7 天列（按周起始日排列表头与命中映射） */}
            {colWeekdays.map((weekday, wi) => {
              const colActive =
                (drag && drag.weekday === weekday) ||
                (!drag && armedCourse && hover?.weekday === weekday);
              const ghost =
                drag && drag.weekday === weekday && drag.start != null
                  ? drag
                  : !drag && armedHoverGhost && armedHoverGhost.weekday === weekday
                    ? armedHoverGhost
                    : null;
              return (
                <div
                  key={weekday}
                  ref={(el) => {
                    colRefs.current[wi] = el;
                  }}
                  onMouseMove={(e) => onColumnMove(e, weekday)}
                  onMouseLeave={() => onColumnLeave(weekday)}
                  onMouseDown={(e) => onColumnMouseDown(e, weekday)}
                  className={`relative min-w-0 flex-1 border-l border-neutral-100 first:border-l-0 transition-colors ${
                    armedCourse && !drag ? "cursor-crosshair" : ""
                  } ${colActive ? "bg-neutral-100/50" : ""}`}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="border-t border-neutral-100/60"
                      style={{ height: pxPerHour }}
                    />
                  ))}

                  {/* 已排课程块 */}
                  {(daySlotsByWeekday.get(weekday) ?? []).map((s) => {
                    const color = colorOfCourse(s.courseId);
                    const isDragging = drag?.slotId === s.id;
                    const top = minutesToPx(s.startMinutes, pxPerHour, gridStartMin);
                    const height = Math.max(16, (s.durationMinutes / 60) * pxPerHour - 2);
                    return (
                      <div
                        key={s.id}
                        onMouseDown={(e) => onBlockMouseDown(e, s)}
                        title={`${s.courseTitle ?? "课程"} · ${minutesLabel(s.startMinutes)}–${minutesLabel(s.startMinutes + s.durationMinutes)} · 拖中间换天/改时间，拖上下边缘调时长`}
                        className={`group absolute inset-x-1 z-10 cursor-grab overflow-hidden rounded-[5px] transition-opacity hover:brightness-[0.97] ${
                          isDragging ? "opacity-30" : ""
                        }`}
                        style={{
                          top: top + 1,
                          height,
                          backgroundColor: `${color}1F`,
                          borderLeft: `3px solid ${color}`,
                          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
                        }}
                      >
                        <div className="pl-1.5 pt-1 pr-1">
                          <div className="truncate text-[11px] font-medium leading-tight text-neutral-900 transition-[padding] group-hover:pr-6">
                            {s.courseTitle ?? "课程"}
                          </div>
                          <div className="truncate text-[9px] leading-tight tabular-nums text-neutral-500">
                            {minutesLabel(s.startMinutes)}–{minutesLabel(s.startMinutes + s.durationMinutes)}
                          </div>
                        </div>
                        <div className="absolute right-1 top-0.5 z-30 hidden group-hover:flex">
                          <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteSlot(s.id);
                            }}
                            aria-label="删除课程安排"
                            title="删除该次安排"
                            className="rounded bg-white/90 px-1 text-[9px] font-medium text-red-500 shadow-sm ring-1 ring-neutral-200 transition-colors hover:bg-red-50"
                          >
                            ✕
                          </button>
                        </div>
                        {/* 上边缘：改开始时间（结束不动） */}
                        <div
                          onMouseDown={(e) => onResizeMouseDown(e, s, "start")}
                          title="拖动调整开始时间"
                          className="group absolute inset-x-0 top-0 z-20 h-2 cursor-ns-resize"
                        >
                          <div className="h-full w-full rounded-t-[5px] transition-colors group-hover:bg-neutral-900/10" />
                        </div>
                        {/* 下边缘：改结束时间（加长/缩短） */}
                        <div
                          onMouseDown={(e) => onResizeMouseDown(e, s, "end")}
                          title="拖动调整结束时间"
                          className="group absolute inset-x-0 bottom-0 z-20 h-2.5 cursor-ns-resize"
                        >
                          <div className="h-full w-full rounded-b-[5px] transition-colors group-hover:bg-neutral-900/10" />
                        </div>
                      </div>
                    );
                  })}

                  {/* 幽灵预览：拖拽目标 / 放置悬停 */}
                  {ghost && (
                    <div
                      className={`pointer-events-none absolute inset-x-1 z-20 ${
                        ghost.conflict ? "opacity-90" : "opacity-80"
                      }`}
                      style={{
                        top: minutesToPx(ghost.start!, pxPerHour, gridStartMin) + 1,
                        height: Math.max(16, (ghost.durationMinutes / 60) * pxPerHour - 2),
                        backgroundColor: ghost.conflict ? "#fee2e2" : `${colorOfCourse(ghost.courseId)}33`,
                        borderLeft: `3px solid ${ghost.conflict ? "#ef4444" : colorOfCourse(ghost.courseId)}`,
                        borderRadius: 5,
                      }}
                    >
                      <div className="truncate pl-1.5 pt-0.5 pr-1 text-[11px] font-medium leading-tight text-neutral-900">
                        {ghost.conflict ? "该时段已有安排" : ghost.title}
                      </div>
                      <div className="truncate pl-1.5 text-[9px] leading-tight tabular-nums text-neutral-600">
                        {minutesLabel(ghost.start!)}–{minutesLabel(ghost.start! + ghost.durationMinutes)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 空网格引导 */}
            {slots.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
                <p className="rounded-md bg-white/70 px-3 py-1.5 text-xs text-neutral-400">
                  {courses.length === 0
                    ? "先新建一门课程，再点空白格或拖入排课"
                    : "点右侧课程 → 在左侧表格点空白格放置；或把课程卡直接拖进来"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 拖拽跟随提示 */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[80]"
          style={{ left: drag.x + 12, top: drag.y - 6 }}
        >
          <span className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg">
            {drag.kind === "library" && drag.courseId != null && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorOfCourse(drag.courseId) }}
              />
            )}
            {drag.kind === "library" && (
              <span className="max-w-[120px] truncate">{drag.title}</span>
            )}
            {drag.weekday != null && drag.start != null ? (
              <span className="tabular-nums text-white/90">
                {minutesLabel(drag.start)}–{minutesLabel(drag.start + drag.durationMinutes)}
              </span>
            ) : (
              <span>松开取消</span>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
