import { useEffect, useRef, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useCourseStore, courseService } from "../../stores/courseStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { startOfWeek, dateStringOf } from "../../lib/date";
import {
  SCHEDULE_WEEKDAYS,
  SCHEDULE_START_HOUR,
  SCHEDULE_HOURS,
  SCHEDULE_ROW_H,
  minutesLabel,
  minutesToPx,
  snapMinutes,
} from "../../lib/schedule";
import type { SlotView } from "../../db/repositories/courseRepository";

const DAY_END_MIN = 24 * 60;

/**
 * 课程表（2.0.x Course Schedule）：每周固定安排视图。
 * - 周一到周日完整显示（不横向滚动）；默认 08:00–22:00；
 * - 左侧课程库：新建课程 / 选中后点格子添加（60 分钟）；
 * - 课程块：拖拽改星期与开始时间（15 分钟吸附）、hover 时长 ±30 / 删除。
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

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [armedId, setArmedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [weekProgress, setWeekProgress] = useState<
    Array<{ courseId: number; title: string; occurrences: number; completed: number }>
  >([]);

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

  const hours = Array.from({ length: SCHEDULE_HOURS }, (_, i) => SCHEDULE_START_HOUR + i);

  const submitCourse = () => {
    const t = draft.trim();
    if (!t) return;
    void createCourse(t);
    setDraft("");
  };

  /** 点击空格子（未武装课程时忽略）：以小时格起点添加 60 分钟安排。 */
  function onColumnDown(e: React.MouseEvent, weekday: number) {
    if (armedId == null || e.button !== 0) return;
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const minutes = snapMinutes(
      SCHEDULE_START_HOUR * 60 + ((e.clientY - rect.top) / SCHEDULE_ROW_H) * 60,
    );
    void addSlot(armedId, weekday, Math.min(minutes, DAY_END_MIN - 60));
    setArmedId(null);
  }

  /** 拖动课程块：水平换天、垂直改开始时间（15 分钟吸附，松手单次提交）。 */
  function startMove(e: React.MouseEvent, slot: SlotView) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const colW = bodyRef.current ? bodyRef.current.getBoundingClientRect().width / 7 : 120;
    const origWeekday = slot.weekday;
    const origStart = slot.startMinutes;
    let dragging = false;
    startWindowDrag(
      {
        onMove: (ev) => {
          if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 4) return;
          dragging = true;
        },
        onUp: (ev) => {
          if (!dragging) return;
          const weekday = Math.max(1, Math.min(7, origWeekday + Math.round((ev.clientX - startX) / colW)));
          const deltaMinutes = Math.round((ev.clientY - startY) / (SCHEDULE_ROW_H / 60));
          const startMinutes = snapMinutes(origStart + deltaMinutes);
          void moveSlot(slot.id, {
            weekday,
            startMinutes: Math.min(startMinutes, DAY_END_MIN - slot.durationMinutes),
          });
        },
      },
      () => {},
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
        <BookOpen size={15} className="text-neutral-400" />
        课程表
        <span className="text-xs font-normal text-neutral-400">
          每周固定安排 · 选课程后点空白格添加（默认 60 分钟），拖块调整时间
        </span>
      </div>

      {/* 本周课程完成状态 */}
      {weekProgress.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          {weekProgress.map((p) => (
            <span key={p.courseId} className="flex items-center gap-1">
              <span className="font-medium text-neutral-800">{p.title}</span>
              <span className={p.completed >= p.occurrences ? "font-semibold text-green-600" : "text-neutral-400"}>
                {p.completed}/{p.occurrences}
              </span>
              <span className="text-neutral-300">·</span>
            </span>
          ))}
          <span className="text-neutral-400">本周完成（按时完成课程任务数 / 应出现次数）</span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* 课程库 */}
        <div className="w-44 shrink-0 space-y-2 rounded-md border border-neutral-200 bg-white p-3">
          <div className="text-xs font-medium text-neutral-600">我的课程</div>
          {courses.length === 0 && (
            <p className="text-xs text-neutral-400">还没有课程，先新建一个</p>
          )}
          <div className="space-y-1">
            {courses.map((c) => (
              <div
                key={c.id}
                className={`group flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                  armedId === c.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 text-neutral-700 hover:border-neutral-400"
                }`}
                onClick={() => setArmedId(armedId === c.id ? null : c.id)}
                title="点击后到右侧格子添加安排"
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteCourse(c.id);
                  }}
                  aria-label={`删除课程 ${c.title}`}
                  className="text-neutral-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCourse();
              }}
              placeholder="新课程"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
            />
            <button
              onClick={submitCourse}
              disabled={draft.trim().length === 0}
              aria-label="添加课程"
              className="rounded-md bg-neutral-900 px-1.5 py-1 text-white disabled:bg-neutral-300"
            >
              <Plus size={12} />
            </button>
          </div>
          {armedId != null && (
            <p className="rounded bg-amber-100/70 px-1.5 py-1 text-[10px] text-amber-800">
              已选中：点击右侧空格子添加安排
            </p>
          )}
        </div>

        {/* 周课程表：周一~周日完整展示（无横向滚动） */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="flex border-b border-neutral-200">
            <div className="w-11 shrink-0" />
            {SCHEDULE_WEEKDAYS.map((w) => (
              <div key={w} className="min-w-0 flex-1 border-l border-neutral-100 py-1 text-center text-xs font-medium text-neutral-500 first:border-l-0">
                {w}
              </div>
            ))}
          </div>
          <div ref={bodyRef} className="flex">
            {/* 小时刻度 */}
            <div className="w-11 shrink-0">
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-neutral-100 px-1 pt-0.5 text-right text-[10px] tabular-nums text-neutral-400"
                  style={{ height: SCHEDULE_ROW_H }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {/* 7 天列 */}
            {SCHEDULE_WEEKDAYS.map((_, wi) => {
              const daySlots = slots.filter((s) => s.weekday === wi + 1);
              return (
                <div
                  key={wi}
                  onMouseDown={(e) => onColumnDown(e, wi + 1)}
                  className="relative min-w-0 flex-1 border-l border-neutral-100 first:border-l-0"
                  style={{ height: SCHEDULE_HOURS * SCHEDULE_ROW_H }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="border-t border-neutral-100/60"
                      style={{ height: SCHEDULE_ROW_H }}
                    />
                  ))}
                  {daySlots.map((s) => {
                    const top = minutesToPx(s.startMinutes);
                    const height = (s.durationMinutes / 60) * SCHEDULE_ROW_H - 2;
                    return (
                      <div
                        key={s.id}
                        onMouseDown={(e) => startMove(e, s)}
                        className="group absolute inset-x-0.5 z-10 cursor-grab overflow-hidden rounded border border-neutral-300 bg-brand/10 px-1 py-0.5 active:cursor-grabbing"
                        style={{ top: top + 1, height: Math.max(16, height) }}
                        title={`${s.courseTitle ?? "课程"} · ${minutesLabel(s.startMinutes)}-${minutesLabel(s.startMinutes + s.durationMinutes)}`}
                      >
                        <div className="truncate text-[10px] font-medium text-neutral-800">
                          {s.courseTitle ?? "课程"}
                        </div>
                        <div className="text-[9px] tabular-nums text-neutral-500">
                          {minutesLabel(s.startMinutes)}-{minutesLabel(s.startMinutes + s.durationMinutes)}
                        </div>
                        <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void moveSlot(s.id, { durationMinutes: s.durationMinutes + 30 });
                            }}
                            title="延长 30 分钟"
                            className="rounded bg-neutral-200/90 px-1 text-[9px] text-neutral-700 hover:bg-neutral-300"
                          >
                            +30
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteSlot(s.id);
                            }}
                            aria-label="删除课程安排"
                            className="rounded bg-neutral-200/90 px-1 text-[9px] text-red-600 hover:bg-red-100"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
