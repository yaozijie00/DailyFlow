/** 任务优先级（v2.3.x）：高 / 中 / 低（与目标优先级同一套三档语义）。 */
export type TaskPriority = "high" | "medium" | "low";

export interface TaskPriorityMeta {
  value: TaskPriority;
  /** 中文短标签 */
  label: string;
  /** 标签文字色 */
  text: string;
  /** 标签底色 */
  bg: string;
  /** 排序权重：值越小越优先 */
  order: number;
}

export const TASK_PRIORITIES: TaskPriorityMeta[] = [
  { value: "high", label: "高", text: "#b91c1c", bg: "#fee2e2", order: 0 },
  { value: "medium", label: "中", text: "#b45309", bg: "#fef3c7", order: 1 },
  { value: "low", label: "低", text: "#475569", bg: "#e2e8f0", order: 2 },
];

const PRIORITY_MAP: ReadonlyMap<string, TaskPriorityMeta> = new Map(
  TASK_PRIORITIES.map((p) => [p.value, p]),
);

export const DEFAULT_TASK_PRIORITY: TaskPriority = "medium";

export function isTaskPriority(v: unknown): v is TaskPriority {
  return v === "high" || v === "medium" || v === "low";
}

/** 取任务优先级元信息；非法/缺失一律回退「中」。 */
export function taskPriorityMeta(value: string | null | undefined): TaskPriorityMeta {
  const hit = PRIORITY_MAP.get(value ?? "");
  return hit ?? PRIORITY_MAP.get(DEFAULT_TASK_PRIORITY)!;
}

/** 按优先序排序用：低值在前（高 > 中 > 低）。 */
export function taskPriorityOrder(value: string | null | undefined): number {
  return taskPriorityMeta(value).order;
}
