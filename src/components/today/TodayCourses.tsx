import { useEffect, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { useCourseStore } from "../../stores/courseStore";
import { useAppStore } from "../../stores/appStore";
import { getHostContext } from "../../extensions/registry";
import { ExtensionCourseRepository } from "../../extensions/builtin/course-schedule/data/repository";
import { todayString, dateStringToStart } from "../../lib/date";
import { slotsForDate } from "../../lib/courseToday";
import { minutesLabel } from "../../lib/schedule";

const linkRepo = new ExtensionCourseRepository();

/**
 * 今日课程（Course Schedule Extension → Today 槽位）：
 * 按课程表每周时段算出今天应上的课，一键「加入今日」。
 * 任务本体由 Core 创建（ctx.createWithId），课程关联写入扩展库 task_links
 * （A1-P0Fix-⑤：不再走 Core tasks.course_id 兼容列，杜绝双轨记账与悬空外键）。
 */
export default function TodayCourses() {
  const slots = useCourseStore((s) => s.slots);
  const pushToast = useAppStore((s) => s.pushToast);
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
    const input = {
      title: s.courseTitle ?? "课程",
      scheduledDate: today,
      plannedStart: base + s.startMinutes * 60_000,
      plannedEnd: base + (s.startMinutes + s.durationMinutes) * 60_000,
    };
    const ctx = getHostContext();
    if (ctx?.tasks.createWithId) {
      const res = await ctx.tasks.createWithId(input);
      if (res.ok && res.id != null && s.courseId != null) {
        await linkRepo.recordTaskLink(res.id, s.courseId);
      }
      if (res.ok) setAdded((prev) => new Set(prev).add(slotId));
      else pushToast("error", "加入今日失败，请重试");
      return;
    }
    // A1-P0Fix-⑤：不再走「写 Core tasks.course_id」的兜底路径（该列 FK 指向 Core 旧课程表，
    // 写入扩展课程 id 会形成悬空外键且与 task_links 双轨记账）；宿主未就绪时明确提示。
    pushToast("error", "任务服务暂未就绪，请稍后重试");
  };

  return (
    <div className="rounded-md border border-border-subtle glass-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <BookOpen size={13} className="text-text-faint" />
        今日课程
      </div>
      <ul className="space-y-1">
        {daySlots.map((s) => {
          const done = added.has(s.id);
          return (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0 tabular-nums text-xs text-text-muted">
                {minutesLabel(s.startMinutes)}-{minutesLabel(s.startMinutes + s.durationMinutes)}
              </span>
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {s.courseTitle ?? "课程"}
              </span>
              <button
                onClick={() => void add(s.id)}
                disabled={done}
                className="flex shrink-0 items-center gap-0.5 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-40"
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
