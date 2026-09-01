import { getDb } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { AchievementProgressRepository } from "../db/repositories/achievementProgressRepository";
import { AchievementService } from "./achievementService";
import { loadAchievementDefinitions } from "../achievements/definitions";
import { useAppStore } from "../stores/appStore";

/**
 * 成就运行时（模块级单例）：专注落库 / 任务变更后统一评估入口。
 * evaluateAndNotify()：评估新解锁成就并弹出成就 Toast（失败静默，不影响业务操作）。
 */
export const achievementService = new AchievementService(
  loadAchievementDefinitions(),
  new AchievementProgressRepository(getDb()),
  new FocusSessionRepository(getDb()),
  new CategoryRepository(getDb()),
  new TaskRepository(getDb()),
);

export async function evaluateAndNotify(): Promise<void> {
  try {
    const newly = await achievementService.evaluate();
    for (const a of newly) {
      useAppStore.getState().pushAchievement(a.name, a.description);
    }
  } catch {
    // 成就评估失败静默：不阻断专注/任务操作
  }
}
