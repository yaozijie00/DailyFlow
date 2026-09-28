import { CATEGORY_COLORS } from "./categoryColors";

/**
 * 长期目标稳定色（v2.3.x 月历视觉升级）：
 * 按目标 id 从全站 12 色调色板循环取色 → 相邻目标必不同色、跨刷新稳定。
 */
export function goalColor(goalId: number): string {
  const n = Math.max(0, Math.round(goalId));
  const idx = n === 0 ? 0 : (n - 1) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[idx];
}
