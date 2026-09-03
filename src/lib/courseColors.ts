import { CATEGORY_COLORS } from "./categoryColors";

/**
 * 课程稳定色（2.0.x Course Schedule 视觉优化）：
 * 按课程 id 从全站 12 色调色板循环取色 → 相邻课程必不同色、跨刷新稳定。
 * 不与 DB 字段绑定（零迁移），课程卡圆点 / 周视图色块 / 图例全程同色。
 */
export function courseColor(courseId: number): string {
  const n = Math.max(0, Math.round(courseId));
  const idx = n === 0 ? 0 : (n - 1) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx];
}
