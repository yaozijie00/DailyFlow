import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { planningMeta, planningWeeks } from "../planningSchema";
import { planningMilestones } from "../ganttSchema";

export interface PlanningSnapshot {
  meta: typeof planningMeta.$inferSelect | null;
  weeks: Array<typeof planningWeeks.$inferSelect>;
  milestones?: Array<typeof planningMilestones.$inferSelect>;
}

export async function snapshotPlanning(db: Db, key: string): Promise<PlanningSnapshot> {
  const [meta, weeks, milestones] = await Promise.all([
    db.select().from(planningMeta).where(eq(planningMeta.key, key)).get(),
    db.select().from(planningWeeks).where(eq(planningWeeks.itemKey, key)).all(),
    db.select().from(planningMilestones).where(key.startsWith("plan:") ? eq(planningMilestones.goalId,Number(key.split(":")[1])) : eq(planningMilestones.projectId,Number(key.split(":")[1]))).all(),
  ]);
  return { meta: meta ?? null, weeks, milestones };
}

/** Restore after the owner and task links. Reviews and changes survive deletion. */
export async function restorePlanning(db: Db, snapshot: PlanningSnapshot): Promise<void> {
  if (snapshot.meta) await db.insert(planningMeta).values(snapshot.meta).run();
  if (snapshot.weeks.length) await db.insert(planningWeeks).values(snapshot.weeks).run();
  if (snapshot.milestones?.length) await db.insert(planningMilestones).values(snapshot.milestones).run();
}
