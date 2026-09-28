import { sql } from "drizzle-orm";
import type { Db } from "../db/db";
import { dateKey } from "../lib/planningDates";

export interface PlanningHealthReason {
  code: "missing_next_action" | "target_review" | "stalled";
  label: string;
  detail: string;
}
interface HealthInput {
  lifecycle: string; archivedAt: number | null; nextAction: string | null;
  targetDate: string | null; createdAt: number; lastActivityAt: number | null;
}

/** Review prompts describe recorded facts; they do not estimate outcome progress. */
export function planningHealth(item: HealthInput, now = Date.now()): PlanningHealthReason[] {
  if (item.archivedAt != null || ["paused", "completed", "archived", "idea"].includes(item.lifecycle)) return [];
  const reasons: PlanningHealthReason[] = [];
  if (!item.nextAction?.trim()) reasons.push({ code: "missing_next_action", label: "补充下一步", detail: "还没有下一步行动，选一个足够小的任务继续。" });
  if (item.targetDate && item.targetDate < dateKey(new Date(now))) reasons.push({ code: "target_review", label: "回顾目标日期", detail: `目标日期 ${item.targetDate} 已过，确认成果是否完成，或调整目标日期。` });
  if (item.lifecycle === "active" && now - Math.max(item.createdAt, item.lastActivityAt ?? item.createdAt) >= 14 * 86400000) {
    reasons.push({ code: "stalled", label: "14 天无推进记录", detail: "近 14 天没有专注或任务完成记录。回顾实际进展，再确定下一步或暂时暂停。" });
  }
  return reasons;
}

/** One bulk aggregate, using the same project-first attribution as weekly actuals. */
export async function readPlanningActivity(db: Db, now = Date.now()): Promise<Map<string, number>> {
  const rows = await db.values(sql`WITH focus_evidence AS (
    SELECT s.session_id, MAX(s.ended_at) AS activity_at FROM focus_segments s
      WHERE s.effective_ms > 0 AND s.ended_at <= ${now} GROUP BY s.session_id
    UNION ALL
    SELECT f.id, f.started_at FROM focus_sessions f
      WHERE f.actual_duration > 0 AND f.started_at <= ${now}
      AND NOT EXISTS (SELECT 1 FROM focus_segments s WHERE s.session_id=f.id AND s.effective_ms > 0)
  ), activity AS (
    SELECT CASE WHEN a.project_id IS NOT NULL THEN 'project:' || a.project_id
      WHEN a.goal_id IS NOT NULL THEN 'plan:' || a.goal_id END AS item_key, e.activity_at
      FROM focus_evidence e JOIN focus_attributions a ON a.session_id=e.session_id
    UNION ALL
    SELECT CASE WHEN t.project_id IS NOT NULL THEN 'project:' || t.project_id
      WHEN t.goal_id IS NOT NULL THEN 'plan:' || t.goal_id END, t.completed_at
      FROM tasks t WHERE t.status='COMPLETED' AND t.completed_at IS NOT NULL AND t.completed_at <= ${now}
  ) SELECT item_key, MAX(activity_at) FROM activity WHERE item_key IS NOT NULL GROUP BY item_key`);
  return new Map(rows.map((row) => [String(row[0]), Number(row[1])]));
}
