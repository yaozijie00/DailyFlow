import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { achievementProgress } from "../schema";

export type AchievementProgress = typeof achievementProgress.$inferSelect;

export class AchievementProgressRepository {
  constructor(private readonly db: Db) {}

  async findById(achievementId: string): Promise<AchievementProgress | null> {
    const row = await this.db
      .select()
      .from(achievementProgress)
      .where(eq(achievementProgress.achievementId, achievementId))
      .get();
    return row ?? null;
  }

  async findAll(): Promise<AchievementProgress[]> {
    return this.db.select().from(achievementProgress).all();
  }

  /** 标记解锁（幂等）：仅当尚未解锁时才写入，保留首次解锁时间。 */
  async markUnlocked(achievementId: string, unlockedAt: number): Promise<void> {
    await this.db
      .insert(achievementProgress)
      .values({ achievementId, unlocked: true, unlockedAt })
      .onConflictDoUpdate({
        target: achievementProgress.achievementId,
        set: { unlocked: true, unlockedAt },
        where: eq(achievementProgress.unlocked, false),
      })
      .run();
  }
}
