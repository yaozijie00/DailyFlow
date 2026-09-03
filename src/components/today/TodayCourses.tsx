import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { useCourseStore } from "../../stores/courseStore";
import { useTaskStore } from "../../stores/taskStore";
import { todayString, dateStringToStart } from "../../lib/date";
import { slotsForDate } from "../../lib/courseToday";
import { minutesLabel } from "../../lib/schedule";

/**
 * 今日课程（2.0.x 课程表 → Today）：
 * 按课程表每周时段算出今天应上的课，一键「加入今日」= 创建带计划时间的今日任务
 * （可撤销；完成/统计随之自然纳入）。
 */
export default function TodayCourses() {
  const slots = useCourseStore((s) => s.slots);
  const createScheduledTask = useTaskStore((s) => s.createScheduledTask);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (useCourseStore.getState().slots.length === 0 && useCourseStore.getState().courses.length === 0) {
      void useCourseStore.getState().load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = todayString();
  const daySlots = slotsForDate(slots, today);
  if (daySlots.length === 0) return null;

  const add = async (slotId: number) => {
    const s = daySlots.find((x) => x.id === slotId);
    if (!s) return;
    const base = dateStringToStart(today);
    const ok = await createScheduledTask({
      title: s.courseTitle ?? "课程",
      scheduledDate: today,
      courseId: s.courseId ?? null,
      plannedStart: base + s.startMinutes * 60_000,
      plannedEnd: base + (s.startMinutes + s.durationMinutes) * 60_000,
    });
    if (ok) setAdded((prev) => new Set(prev).add(slotId));
  };

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-600">
        <BookOpen size={13} className="text-neutral-400" />
        今日课程
      </div>
      <ul className="space-y-1">
        {daySlots.map((s) => {
          const done = added.has(s.id);
          return (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0 tabular-nums text-xs text-neutral-500">
                {minutesLabel(s.startMinutes)}-{minutesLabel(s.startMinutes + s.durationMinutes)}
              </span>
              <span className="min-w-0 flex-1 truncate text-neutral-800">
                {s.courseTitle ?? "课程"}
              </span>
              <button
                onClick={() => void add(s.id)}
                disabled={done}
                className="flex shrink-0 items-center gap-0.5 rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
              >
                {done ? "已加入" : <><Plus size={11} /> 加入今日</>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
