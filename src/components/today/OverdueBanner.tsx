import { useTaskStore } from "../../stores/taskStore";

/**
 * 昨日未完成 → 今日结转横幅（v1.6.2 优化）：
 * - 打开「今日」且有昨日未完成任务时出现；
 * - 逐项「移到今天」或「全部移到今天」，结转可一次批量撤销；
 * - 仅在查看今天时由 Today 页渲染（overdue 数据本身带日期守卫）。
 */
export default function OverdueBanner() {
  const overdue = useTaskStore((s) => s.overdue);
  const carryOver = useTaskStore((s) => s.carryOver);

  if (overdue.length === 0) return null;

  const shown = overdue.slice(0, 5);
  const rest = overdue.length - shown.length;

  return (
    <div className="rounded-md border border-warn/40 bg-warn/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-warn">
          昨天有 {overdue.length} 项任务未完成
        </span>
        <button
          onClick={() => void carryOver([])}
          className="shrink-0 text-xs text-warn underline underline-offset-2 hover:text-warn"
        >
          全部移到今天
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {shown.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-warn/90">
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <button
              onClick={() => void carryOver([t.id])}
              className="shrink-0 rounded border border-warn/50 px-1.5 py-0.5 text-warn hover:bg-warn/20"
            >
              移到今天
            </button>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <div className="mt-1.5 text-[10px] text-warn/70">…还有 {rest} 项</div>
      )}
    </div>
  );
}
