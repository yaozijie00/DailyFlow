import { useMemo } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { formatDurationCompact } from "../../lib/format";
import { dateKey, parseDateKey } from "../../lib/monthView";
import type { Task } from "../../db/repositories/taskRepository";

/** 建议每日计划容量（分钟；v1.7 默认 8 小时，后续可设置化）。 */
export const DEFAULT_DAILY_CAPACITY_MIN = 8 * 60;

interface Conflict {
  a: Task;
  b: Task;
}

function tomorrowKey(): string {
  const d = parseDateKey(dateKey(new Date()));
  if (!d) return dateKey(new Date());
  d.setDate(d.getDate() + 1);
  return dateKey(d);
}

/**
 * 今日计划警告（v1.7）：
 * - 时间冲突：TODO 任务计划区间相互重叠 → ⚠ 提示（可手动调整/移动解决）；
 * - 日程超载：TODO 计划总时长超过建议容量 → 提示并提供「移到明天」。
 * 只读提示 + 快捷操作，不自动改数据。
 */
export default function DayPlanWarnings() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);

  const planTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "TODO" && t.plannedStart != null && t.plannedEnd != null,
      ),
    [tasks],
  );

  const conflicts = useMemo<Conflict[]>(() => {
    const out: Conflict[] = [];
    for (let i = 0; i < planTasks.length; i++) {
      for (let j = i + 1; j < planTasks.length; j++) {
        const a = planTasks[i];
        const b = planTasks[j];
        if (a.id === b.id) continue;
        const overlap =
          a.plannedStart! < b.plannedEnd! && b.plannedStart! < a.plannedEnd!;
        if (overlap) out.push({ a, b });
      }
    }
    return out;
  }, [planTasks]);

  const totalPlanMinutes = useMemo(
    () =>
      Math.round(
        planTasks.reduce(
          (sum, t) => sum + (t.plannedEnd! - t.plannedStart!) / 60_000,
          0,
        ),
      ),
    [planTasks],
  );

  if (conflicts.length === 0 && totalPlanMinutes <= DEFAULT_DAILY_CAPACITY_MIN) {
    return null;
  }

  const overload = totalPlanMinutes - DEFAULT_DAILY_CAPACITY_MIN;

  return (
    <div className="space-y-2">
      {conflicts.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50/80 p-3 text-sm text-red-700">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle size={14} />
            时间冲突（{conflicts.length} 处）——拖动时间块可调整
          </div>
          <ul className="space-y-0.5 text-xs text-red-600/90">
            {conflicts.slice(0, 4).map((c, i) => (
              <li key={i}>
                「{c.a.title}」与「{c.b.title}」时间段重叠
              </li>
            ))}
            {conflicts.length > 4 && <li>…还有 {conflicts.length - 4} 处</li>}
          </ul>
        </div>
      )}

      {overload > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-800">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <CalendarClock size={14} />
            今日计划共 {formatDurationCompact(totalPlanMinutes * 60)}，超出建议容量{" "}
            {formatDurationCompact(DEFAULT_DAILY_CAPACITY_MIN * 60)}
          </div>
          <div className="space-y-0.5">
            {planTasks
              .slice()
              .sort(
                (a, b) =>
                  (b.plannedEnd! - b.plannedStart!) -
                  (a.plannedEnd! - a.plannedStart!),
              )
              .slice(0, 3)
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 text-xs text-amber-700/90"
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatDurationCompact((t.plannedEnd! - t.plannedStart!) / 1000)}
                  </span>
                  <button
                    onClick={() => void updateTask(t.id, { scheduledDate: tomorrowKey() })}
                    className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 hover:bg-amber-100"
                  >
                    移到明天
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
