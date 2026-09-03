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
    <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-amber-800">
          昨天有 {overdue.length} 项任务未完成
        </span>
        <button
          onClick={() => void carryOver([])}
          className="shrink-0 text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900"
        >
          全部移到今天
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {shown.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-amber-900/90">
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <button
              onClick={() => void carryOver([t.id])}
              className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 text-amber-700 hover:bg-amber-100"
            >
              移到今天
            </button>
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <div className="mt-1.5 text-[10px] text-amber-700/70">…还有 {rest} 项</div>
      )}
    </div>
  );
}
