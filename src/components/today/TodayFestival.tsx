import { todayFestivals } from "../../lib/festival";
import { dateStringToStart } from "../../lib/date";

/** 某日节日/节气：有则渲染「 · 今日：XX / XX」，无则返回 null。 */
export default function TodayFestival({ date }: { date: string }) {
  const ts = dateStringToStart(date);
  const festivals = todayFestivals(Number.isNaN(ts) ? new Date() : new Date(ts));
  if (festivals.length === 0) return null;
  return (
    <span className="text-sm text-neutral-500">
      {" "}
      · 今日：
      <span className="font-medium text-neutral-700">{festivals.join(" / ")}</span>
    </span>
  );
}
