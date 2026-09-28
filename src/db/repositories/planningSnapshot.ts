import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { planningMeta, planningWeeks } from "../planningSchema";

export interface PlanningSnapshot {
  meta: typeof planningMeta.$inferSelect | null;
  weeks: Array<typeof planningWeeks.$inferSelect>;
}

export async function snapshotPlanning(db: Db, key: string): Promise<PlanningSnapshot> {
  const [meta, weeks] = await Promise.all([
    db.select().from(planningMeta).where(eq(planningMeta.key, key)).get(),
    db.select().from(planningWeeks).where(eq(planningWeeks.itemKey, key)).all(),
  ]);
  return { meta: meta ?? null, weeks };
}

/** Restore after the owner and task links. Reviews and changes survive deletion. */
export async function restorePlanning(db: Db, snapshot: PlanningSnapshot): Promise<void> {
  if (!snapshot.meta) return;
  await db.insert(planningMeta).values(snapshot.meta).run();
  if (snapshot.weeks.length) await db.insert(planningWeeks).values(snapshot.weeks).run();
}
