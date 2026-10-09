import type { Task } from "../db/repositories/taskRepository";
import type { TaskRange } from "../services/ganttService";
import { addDays } from "./planningDates";
import { isLocalDate } from "../services/taskSchedulingService";

export type DateSpan = { startDay: string; endDay: string };
export function dayDistance(a: string, b: string) {
  const parse = (key: string) => { const [y,m,d] = key.split("-").map(Number); return Date.UTC(y,m-1,d); };
  return Math.round((parse(b) - parse(a)) / 86400000);
}
export function taskSpan(task: Task, ranges: TaskRange[]): DateSpan | null {
  const explicit = ranges.find((range) => range.taskId === task.id);
  if (explicit) return explicit;
  return isLocalDate(task.scheduledDate) ? { startDay: task.scheduledDate, endDay: task.scheduledDate } : null;
}
export function summarySpan(spans: (DateSpan | null)[]): DateSpan | null {
  const rows = spans.filter((span): span is DateSpan => !!span);
  return rows.length ? { startDay: rows.map((s) => s.startDay).sort()[0], endDay: rows.map((s) => s.endDay).sort().slice(-1)[0] } : null;
}
export function shiftSpan(span: DateSpan, days: number, edge: "move" | "start" | "end"): DateSpan {
  const startDay = edge === "end" ? span.startDay : addDays(span.startDay, days);
  const endDay = edge === "start" ? span.endDay : addDays(span.endDay, days);
  return edge === "start" ? { startDay:startDay > endDay ? endDay : startDay,endDay }
    : edge === "end" ? { startDay,endDay:endDay < startDay ? startDay : endDay } : { startDay,endDay };
}
