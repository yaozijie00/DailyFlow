import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, X } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { formatDurationCompact } from "../../lib/format";
import {
  computeReminderSummary,
  hasAnyReminder,
} from "../../lib/dayWarnings";

/** 右栏固定宽度（px；与 Today 布局常量对齐）。 */
export const REMINDER_RAIL_WIDTH = 260;

const ICON_BTN =
  "rounded p-1 text-neutral-400 transition-colors hover:bg-black/5 hover:text-neutral-700";

function CardHeader({
  icon,
  title,
  badge,
  folded,
  onFold,
  onDismiss,
  dismissLabel,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  folded: boolean;
  onFold: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-800">{title}</span>
      {badge != null && (
        <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-px text-[10px] font-semibold text-neutral-600">
          {badge}
        </span>
      )}
      <button
        onClick={onFold}
        aria-label={folded ? "展开提醒" : "折叠提醒"}
        className={ICON_BTN}
      >
        <ChevronDown size={14} className={`transition-transform ${folded ? "-rotate-90" : ""}`} />
      </button>
      <button onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel} className={ICON_BTN}>
        <X size={14} />
      </button>
    </div>
  );
}

/** 昨日未完成卡（≤3 条 + 查看全部 + 全部移到今天）。 */
function OverdueCard({ dismissed, onDismiss }: { dismissed: boolean; onDismiss: () => void }) {
  const overdue = useTaskStore((s) => s.overdue);
  const carryOver = useTaskStore((s) => s.carryOver);
  const [folded, setFolded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (dismissed || overdue.length === 0) return null;

  const items = overdue.slice(0, 3);
  const rest = overdue.length - items.length;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
      <CardHeader
        icon={<AlertTriangle size={14} className="text-amber-500" />}
        title="昨日未完成"
        badge={`${overdue.length} 项`}
        folded={folded}
        onFold={() => setFolded((v) => !v)}
        onDismiss={onDismiss}
        dismissLabel="暂时收起昨日未完成提醒"
      />
      {!folded && (
        <div className="mt-2 space-y-1.5">
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs text-amber-900/90">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <button
                onClick={() => void carryOver([t.id])}
                className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 text-amber-700 transition-colors hover:bg-amber-100"
              >
                移到今天
              </button>
            </div>
          ))}
          {!showAll && rest > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="flex items-center gap-0.5 text-[11px] text-amber-700 underline-offset-2 hover:underline"
            >
              还有 {rest} 项 <ChevronRight size={12} />
            </button>
          )}
          {showAll &&
            overdue.slice(3).map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-amber-900/90">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <button
                  onClick={() => void carryOver([t.id])}
                  className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 text-amber-700 transition-colors hover:bg-amber-100"
                >
                  移到今天
                </button>
              </div>
            ))}
          <button
            onClick={() => void carryOver([])}
            className="mt-1 flex items-center gap-0.5 text-[11px] text-amber-700 underline-offset-2 hover:underline"
          >
            全部移到今天 <ChevronRight size={12} />
          </button>
        </div>
      )}
    </section>
  );
}

/** 时间冲突 / 日程超载卡。 */
function PlanWarnCard({ dismissed, onDismiss }: { dismissed: boolean; onDismiss: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const selectTask = useTaskStore((s) => s.selectTask);
  const [folded, setFolded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const summary = useMemo(() => computeReminderSummary(tasks, 0), [tasks]);
  const topPlanned = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "TODO" && t.plannedStart != null && t.plannedEnd != null)
        .sort((x, y) => (y.plannedEnd! - y.plannedStart!) - (x.plannedEnd! - x.plannedStart!))
        .slice(0, 3),
    [tasks],
  );
  const { conflicts, overload } = summary;
  const hasConflicts = conflicts.length > 0;
  const hasOverload = overload > 0;
  if (dismissed || (!hasConflicts && !hasOverload)) return null;

  const title = hasConflicts ? "时间冲突" : "日程超载";
  const visibleConflicts = showAll ? conflicts : conflicts.slice(0, 3);

  return (
    <section
      className={`rounded-lg border p-2.5 ${
        hasConflicts ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <CardHeader
        icon={
          hasConflicts ? (
            <AlertTriangle size={14} className="text-red-500" />
          ) : (
            <CalendarClock size={14} className="text-amber-500" />
          )
        }
        title={title}
        badge={
          hasConflicts
            ? `${conflicts.length} 处`
            : formatDurationCompact(overload * 60)
        }
        folded={folded}
        onFold={() => setFolded((v) => !v)}
        onDismiss={onDismiss}
        dismissLabel="暂时收起计划提醒"
      />
      {!folded && (
        <div className="mt-2 space-y-1.5 text-xs">
          {visibleConflicts.map((c, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-red-800/90">
                  「{c.a.title}」与「{c.b.title}」
                </span>
                <button
                  onClick={() => selectTask(c.a.id)}
                  title="在时间轴中定位该任务"
                  className="shrink-0 rounded border border-red-200 px-1.5 py-0.5 text-red-600 transition-colors hover:bg-red-100"
                >
                  定位
                </button>
              </div>
              <div className="text-[10px] tabular-nums text-neutral-500">{c.rangeLabel}</div>
            </div>
          ))}
          {!showAll && conflicts.length > 3 && (
            <button
              onClick={() => setShowAll(true)}
              className="flex items-center gap-0.5 text-[11px] text-red-600 underline-offset-2 hover:underline"
            >
              还有 {conflicts.length - 3} 处 <ChevronRight size={12} />
            </button>
          )}
          {hasOverload && (
            <div className="border-t border-neutral-200/70 pt-1.5">
              <div className="flex items-center gap-1 text-amber-800">
                <CalendarClock size={12} className="shrink-0 text-amber-500" />
                超出建议容量 {formatDurationCompact(overload * 60)}
              </div>
              {topPlanned.map((t) => (
                <div key={t.id} className="mt-1 flex items-center gap-2 text-amber-800/90">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <button
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
                      void updateTask(t.id, { scheduledDate: ymd });
                    }}
                    className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    移到明天
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * 今日提醒（Contextual Sidebar）：只放与今天相关的辅助信息。
 * 卡片「×」为暂时收起（本次会话；下次进入/数据清空后自动恢复）。
 * 全部收起或无任何提醒 → 整栏返回 null，不占主区宽度。
 */
export default function ReminderRail() {
  const overdue = useTaskStore((s) => s.overdue);
  const tasks = useTaskStore((s) => s.tasks);
  const summary = useMemo(
    () => computeReminderSummary(tasks, overdue.length),
    [tasks, overdue],
  );
  const [overdueHidden, setOverdueHidden] = useState(false);
  const [planHidden, setPlanHidden] = useState(false);

  // 数据清空后自动复位（下次再出现时恢复显示）
  useEffect(() => {
    if (summary.overdueCount === 0) setOverdueHidden(false);
    if (summary.conflicts.length === 0 && summary.overload === 0) setPlanHidden(false);
  }, [summary.overdueCount, summary.conflicts.length, summary.overload]);

  if (!hasAnyReminder(summary)) return null;
  const hasOverdue = summary.overdueCount > 0 && !overdueHidden;
  const hasPlan =
    (summary.conflicts.length > 0 || summary.overload > 0) && !planHidden;
  if (!hasOverdue && !hasPlan) return null;

  return (
    <aside aria-label="今日提醒" className="w-full space-y-3 overflow-y-auto">
      <OverdueCard dismissed={overdueHidden} onDismiss={() => setOverdueHidden(true)} />
      <PlanWarnCard dismissed={planHidden} onDismiss={() => setPlanHidden(true)} />
    </aside>
  );
}
