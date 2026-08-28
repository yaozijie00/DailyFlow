/** 分类预设调色板（12 色）。 */
export const CATEGORY_COLORS = [
  "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ef4444", "#06b6d4",
  "#ec4899", "#eab308", "#6366f1", "#f43f5e", "#92400e", "#84cc16",
] as const;

/** 「无分类」任务的默认颜色。 */
export const NO_CATEGORY_COLOR = "#9ca3af";

/** 按序号取默认分类色（循环）。 */
export function defaultCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
