import { sql } from "drizzle-orm";
import type { Db } from "../../db/db";
import type { FocusRequest } from "./types";

export function localInput(stamp: number) {
  const date = new Date(stamp);
  return new Date(stamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

/** Omit unchanged fields: the native edit retains the exact original milliseconds. */
export function historyTiming(row: { startedAt: number; actualSeconds: number } | null, start: string, minutes: string): Pick<FocusRequest, "startedAt" | "durationSeconds"> {
  const timing: Pick<FocusRequest, "startedAt" | "durationSeconds"> = {};
  if (!row || start !== localInput(row.startedAt)) timing.startedAt = new Date(start).getTime();
  if (!row || Number(minutes) !== row.actualSeconds / 60) timing.durationSeconds = Math.round(Number(minutes) * 60);
  return timing;
}

export interface FocusOverlap { id: number; title: string }
/** Segments are the evidence of work; never fill known paused gaps with session bounds. */
export async function findFocusOverlaps(db: Db, from: number, to: number, excludeId?: number, now = Date.now()): Promise<FocusOverlap[]> {
  const rows = await db.values(sql`WITH intervals AS (
    SELECT session_id,started_at,ended_at FROM focus_segments WHERE effective_ms>0
    UNION ALL
    SELECT f.id,f.started_at,COALESCE(f.ended_at,f.started_at+f.actual_duration*1000)
    FROM focus_sessions f LEFT JOIN focus_details d ON d.session_id=f.id
    WHERE f.actual_duration>0 AND (d.source='legacy' OR d.session_id IS NULL)
    AND NOT EXISTS(SELECT 1 FROM focus_segments s WHERE s.session_id=f.id)
    UNION ALL
    SELECT session_id,running_since,${now} FROM focus_details WHERE status='running' AND running_since IS NOT NULL
  ) SELECT DISTINCT f.id,COALESCE(NULLIF(d.task_title,''),t.title,'无关联专注')
    FROM intervals i JOIN focus_sessions f ON f.id=i.session_id
    LEFT JOIN focus_details d ON d.session_id=f.id LEFT JOIN tasks t ON t.id=f.task_id
    WHERE i.started_at<${to} AND i.ended_at>${from} AND f.id<>${excludeId ?? -1}
    ORDER BY f.id`);
  return rows.map((row) => ({ id: Number(row[0]), title: String(row[1]) }));
}
