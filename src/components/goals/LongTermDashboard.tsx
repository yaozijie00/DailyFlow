import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, Plus, Sparkles } from "lucide-react";
import type { GoalWithProgress, UpdateGoalInput } from "../../db/repositories/goalRepository";
import {
  calculateCapacity,
  calculatePlanHealth,
  effectiveWeeklyPaceMinutes,
  estimateCompletionDate,
  normalizeLongTermPriority,
} from "../../lib/longTermPlan";
import { postponeTargets } from "../../lib/postpone";
import { todayString } from "../../lib/date";

interface Props {
  plans: GoalWithProgress[];
  capacityMinutes: number;
  onCapacityChange: (minutes: number) => void;
  onOpen: (id: number) => void;
  onSchedule: (plan: GoalWithProgress, date: string) => void;
  onUpdate: (id: number, input: UpdateGoalInput) => void;
  onCreate: () => void;
}

const HEALTH = {
  unknown: { label: "未建立进度基准", className: "text-text-muted bg-surface-muted" },
  ahead: { label: "进度超前", className: "text-success bg-success-soft" },
  healthy: { label: "状态正常", className: "text-success bg-success-soft" },
  slightly_behind: { label: "略微落后", className: "text-warning bg-warning-soft" },
  seriously_behind: { label: "严重落后", className: "text-danger bg-danger-soft" },
  paused: { label: "已暂停", className: "text-text-muted bg-surface-muted" },
} as const;

function hours(minutes: number): string {
  const value = Math.round((minutes / 60) * 10) / 10;
  return `${value}h`;
}

function shortDate(value: string | null): string {
  return value ? value.slice(5).replace("-", "/") : "未设置";
}

export default function LongTermDashboard({
  plans, capacityMinutes, onCapacityChange, onOpen, onSchedule, onUpdate, onCreate,
}: Props) {
  const today = todayString();
  const activePlans = plans.filter((plan) => plan.status !== "paused");
  const capacity = calculateCapacity(
    capacityMinutes,
    activePlans.map((plan) => ({
      id: plan.id,
      priority: normalizeLongTermPriority(plan.priority),
      weeklyTargetMinutes: plan.weeklyTargetMinutes,
    })),
  );
  const actualMinutes = plans.reduce((sum, plan) => sum + Math.round(plan.weeklyFocusSeconds / 60), 0);
  const behindCount = plans.filter((plan) => {
    const health = calculatePlanHealth({
      status: plan.status,
      plannedProgress: null,
      actualProgress: plan.progressPercent,
    });
    return health.state === "slightly_behind" || health.state === "seriously_behind";
  }).length;
  const candidateNames = capacity.adjustmentCandidateIds
    .map((id) => plans.find((plan) => plan.id === id)?.title)
    .filter(Boolean)
    .join("、");

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border-subtle pb-4 sm:grid-cols-4 xl:grid-cols-5">
        <Summary label="本周长期投入" value={hours(capacity.requiredMinutes)} detail={`${plans.length} 个计划`} icon={<Clock3 size={15} />} />
        <Summary label="已完成时间" value={hours(actualMinutes)} detail={`${Math.min(100, Math.round((actualMinutes / Math.max(1, capacity.requiredMinutes)) * 100))}%`} icon={<CheckCircle2 size={15} />} />
        <Summary label="剩余时间" value={hours(Math.max(0, capacity.requiredMinutes - actualMinutes))} detail="本周目标" icon={<CalendarClock size={15} />} />
        <Summary label="容量状态" value={capacity.overloadMinutes > 0 ? `超载 ${hours(capacity.overloadMinutes)}` : `余量 ${hours(capacityMinutes - capacity.requiredMinutes)}`} detail={capacity.overloadMinutes > 0 ? "需要调整" : "安排合理"} tone={capacity.overloadMinutes > 0 ? "danger" : "normal"} icon={<AlertTriangle size={15} />} />
        <div className="col-span-2 flex items-center gap-3 sm:col-span-4 xl:col-span-1 xl:block">
          <label className="shrink-0 text-xs text-text-muted">每周可用容量</label>
          <div className="mt-1 flex items-center gap-1.5">
            <input aria-label="每周可用容量" type="number" min={0} max={168} step={0.5} value={capacityMinutes / 60}
              onChange={(event) => onCapacityChange(Math.max(0, Math.round(Number(event.target.value) * 60)))}
              className="w-20 min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm font-semibold tabular-nums text-text-primary outline-none focus:border-accent" />
            <span className="text-xs text-text-muted">h</span>
          </div>
        </div>
      </section>

      {capacity.overloadMinutes > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>本周长期计划超载 {hours(capacity.overloadMinutes)}。{candidateNames && `${candidateNames} 优先考虑减少投入或顺延。`}</span>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <Sparkles className="mx-auto mb-3 text-accent" size={28} />
          <h2 className="text-base font-semibold text-text-primary">把远期目标变成可以每周推进的计划</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">设置目标日期、每周投入和下一步行动，DailyFlow 会帮你看清进度与容量。</p>
          <button onClick={onCreate} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm text-on-accent hover:bg-accent-hover"><Plus size={15} />新建长期计划</button>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const priority = normalizeLongTermPriority(plan.priority);
            const planned = null;
            const health = calculatePlanHealth({ status: plan.status, plannedProgress: planned, actualProgress: plan.progressPercent });
            const healthMeta = HEALTH[health.state];
            const weeklyActual = Math.round(plan.weeklyFocusSeconds / 60);
            const weeklyPace = effectiveWeeklyPaceMinutes(
              plan.startDate,
              plan.focusSeconds,
              plan.weeklyTargetMinutes,
            );
            const estimatedDate = plan.estimatedCompletionDate
              ?? (plan.totalTasks > 0 ? estimateCompletionDate(today, plan.remainingEstimatedMinutes, weeklyPace) : null);
            return (
              <article key={plan.id} className="group relative min-w-0 rounded-lg border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start gap-2">
                  <button onClick={() => onOpen(plan.id)} className="min-w-0 flex-1 text-left">
                    <h2 className="truncate text-base font-semibold text-text-primary group-hover:text-accent">{plan.title}</h2>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{plan.description || "尚未填写计划目标"}</p>
                  </button>
                  <select aria-label={`${plan.title} 优先级`} value={priority} onChange={(event) => onUpdate(plan.id, { priority: event.target.value as UpdateGoalInput["priority"] })}
                    className="rounded-md border border-border-subtle bg-surface-muted px-1.5 py-1 text-[11px] font-semibold text-text-secondary outline-none focus:border-accent">
                    <option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option><option value="p4">P4</option>
                  </select>
                  <span className="rounded-md bg-surface-muted px-1.5 py-1 text-[11px] text-text-muted">
                    {plan.status === "paused" ? "暂停" : plan.status === "not_started" ? "未开始" : "进行中"}
                  </span>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="text-xl font-semibold tabular-nums tracking-tight text-text-primary">{plan.progressPercent}<span className="ml-0.5 text-sm text-text-muted">%</span></div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${healthMeta.className}`}>{healthMeta.label}{health.deviationPercent != null && health.deviationPercent !== 0 && health.state !== "paused" ? ` ${health.deviationPercent > 0 ? "+" : ""}${health.deviationPercent} 个百分点` : ""}</span>
                </div>
                <div role="progressbar" aria-label={`${plan.title} 进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.progressPercent} className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${plan.progressPercent}%` }} /></div>

                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <Meta label="当前阶段" value={plan.currentPhaseTitle ?? "未设置"} />
                  <Meta label="本周" value={`${hours(weeklyActual)} / ${hours(plan.weeklyTargetMinutes)}`} strong />
                  <Meta label="目标完成" value={shortDate(plan.deadline)} />
                  <Meta label="预计完成" value={estimatedDate ? shortDate(estimatedDate) : "数据不足"} tone={estimatedDate && plan.deadline && estimatedDate > plan.deadline ? "warning" : undefined} />
                </dl>
                <div className="mt-4 rounded-lg bg-surface-muted/70 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-faint">下一步</div>
                  <div className="mt-0.5 truncate text-sm font-medium text-text-primary">{plan.nextAction || "在计划详情中设置下一步行动"}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button aria-label="加入今天" onClick={() => onSchedule(plan, today)} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-on-accent hover:bg-accent-hover">加入今天</button>
                  <button onClick={() => onSchedule(plan, postponeTargets(today).tomorrow)} className="rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs text-text-secondary hover:bg-surface-hover">安排明天</button>
                  <input aria-label={`${plan.title} 安排日期`} type="date" defaultValue="" onChange={(event) => event.target.value && onSchedule(plan, event.target.value)} className="min-h-8 w-[34px] rounded-lg border border-border-strong bg-surface px-1 text-xs text-text-secondary" title="安排日期" />
                  <button aria-label="查看计划" onClick={() => onOpen(plan.id)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary">查看计划<ArrowRight size={13} /></button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {behindCount > 0 && <p className="text-xs text-text-faint">当前有 {behindCount} 个计划落后于原计划进度，暂停计划不会继续产生落后提醒。</p>}
    </div>
  );
}

function Summary({ label, value, detail, icon, tone = "normal" }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "normal" | "danger" }) {
  return <div className="min-w-0">
    <div className="flex items-center gap-1.5 text-xs text-text-muted">{icon}{label}</div>
    <div className={`mt-1 text-base font-semibold tabular-nums ${tone === "danger" ? "text-warning" : "text-text-primary"}`}>{value}</div>
    <div className="mt-0.5 text-xs text-text-muted">{detail}</div>
  </div>;
}

function Meta({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warning" }) {
  return <div><dt className="text-text-faint">{label}</dt><dd className={`mt-0.5 truncate tabular-nums ${strong ? "font-semibold text-text-primary" : tone === "warning" ? "text-warning" : "text-text-secondary"}`}>{value}</dd></div>;
}
