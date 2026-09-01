/**
 * 每日完成任务柱状图（自绘 div，无第三方库）。
 * 横轴=日期，柱高=完成数；hover 显示 tooltip。
 */
export function CompletedTasksChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const showLabels = data.length <= 31;
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {data.map((d) => {
          const h = Math.max(4, Math.round((d.count / max) * 100));
          return (
            <div
              key={d.date}
              title={`${d.date}：完成 ${d.count} 个任务`}
              className="flex-1 rounded-t-sm bg-neutral-900/80 transition-colors hover:bg-neutral-900"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>{data[0]?.date}</span>
        {showLabels && data.length > 1 && <span>{data[Math.floor(data.length / 2)]?.date}</span>}
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
