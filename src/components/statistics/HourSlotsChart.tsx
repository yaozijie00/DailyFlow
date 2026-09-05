import type { HourlyStatistic } from "../../services/statisticsService";
import { formatDurationCompact } from "../../lib/format";

/** 时段分界（小时）：上午 / 下午 / 晚间。 */
const SLOTS = [
  { key: "morning", label: "上午", from: 5, to: 12 },
  { key: "afternoon", label: "下午", from: 12, to: 18 },
  { key: "evening", label: "晚间", from: 18, to: 24 },
] as const;

export type HourSlotKey = (typeof SLOTS)[number]["key"];

/** 按 上午/下午/晚间 聚合小时数据；返回含秒数与占比的槽列表。 */
export function aggregateHourSlots(hourly: HourlyStatistic[]): {
  key: HourSlotKey;
  label: string;
  seconds: number;
  pct: number;
  count: number;
}[] {
  const total = hourly.reduce((s, h) => s + h.seconds, 0);
  return SLOTS.map((slot) => {
    const seconds = hourly
      .filter((h) => h.hour >= slot.from && h.hour < slot.to)
      .reduce((s, h) => s + h.seconds, 0);
    return {
      key: slot.key,
      label: slot.label,
      seconds,
      pct: total > 0 ? Math.round((seconds / total) * 100) : 0,
      count: hourly.filter((h) => h.hour >= slot.from && h.hour < slot.to).length,
    };
  });
}

/** 时段分布卡（今日）：上午/下午/晚间投入占比 + 高亮主时段（效率复盘用）。 */
export function HourSlotsChart({ hourly }: { hourly: HourlyStatistic[] }) {
  if (hourly.length === 0) {
    return <p className="text-sm text-text-faint">暂无今日数据</p>;
  }
  const slots = aggregateHourSlots(hourly);
  const top = slots.reduce((a, b) => (b.seconds > a.seconds ? b : a), slots[0]);
  const hasAny = top.seconds > 0;
  if (!hasAny) {
    return <p className="text-sm text-text-faint">今日暂无投入</p>;
  }

  return (
    <div>
      {/* 三段占比条 */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted">
        {slots.map((s) =>
          s.seconds > 0 ? (
            <div
              key={s.key}
              title={`${s.label}：${formatDurationCompact(s.seconds)}`}
              style={{
                width: `${s.pct}%`,
                background:
                  s.key === "morning"
                    ? "var(--chart-2)"
                    : s.key === "afternoon"
                      ? "var(--chart-3)"
                      : "var(--chart-4)",
              }}
            />
          ) : null,
        )}
      </div>
      {/* 明细 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {slots.map((s) => (
          <div
            key={s.key}
            className={`rounded-md border p-2 text-center ${
              top.key === s.key && s.seconds > 0
                ? "border-accent/50 bg-accent-soft"
                : "border-border-subtle bg-surface/50"
            }`}
          >
            <div className="text-[11px] text-text-muted">{s.label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">
              {formatDurationCompact(s.seconds)}
            </div>
            <div className="text-[10px] tabular-nums text-text-faint">{s.pct}%</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-faint">
        {top.seconds > 0
          ? `今天你的高能时段在「${top.label}」（${formatDurationCompact(top.seconds)}）。复盘时可把重要任务安排到该时段。`
          : "完成一次专注后，这里会显示你的时段分布。"}
      </p>
    </div>
  );
}
