import { sql } from "drizzle-orm";
import type { Db } from "./db";
export interface FocusSlice {
  sessionId: number; categoryId: number | null; projectId: number | null; goalId: number | null;
  projectTitle: string | null; startedAt: number; endedAt: number; seconds: number; completed: boolean; legacy: boolean;
}
/** One bounded query. Old records retain their start-date convention; exact work segments split at local boundaries. */
export async function readFocusSlices(db: Db, from = 0, to = 8640000000000000): Promise<FocusSlice[]> {
  const rows = await db.values(sql`WITH totals AS (
      SELECT session_id,SUM(effective_ms) AS ms,MAX(id) AS last_id FROM focus_segments GROUP BY session_id
    ), slices AS (
      SELECT f.id,f.category_id,s.started_at,s.ended_at,
      MIN(f.actual_duration*1000,t.ms)*s.effective_ms*1.0/t.ms/1000 AS seconds,
      CASE WHEN f.completed=1 AND s.id=t.last_id THEN 1 ELSE 0 END AS completed,s.id AS segment_id
      FROM focus_sessions f JOIN focus_segments s ON s.session_id=f.id JOIN totals t ON t.session_id=f.id
      LEFT JOIN focus_details d ON d.session_id=f.id
      WHERE f.actual_duration>0 AND t.ms>0 AND (d.status='finished' OR d.session_id IS NULL)
      AND s.started_at<${to} AND s.ended_at>${from}
      UNION ALL
      SELECT f.id,f.category_id,f.started_at,f.started_at,
      MAX(0,f.actual_duration-COALESCE(t.ms,0)/1000.0),CASE WHEN t.session_id IS NULL THEN f.completed ELSE 0 END,NULL
      FROM focus_sessions f LEFT JOIN totals t ON t.session_id=f.id LEFT JOIN focus_details d ON d.session_id=f.id
      WHERE f.actual_duration>COALESCE(t.ms,0)/1000.0 AND (d.status='finished' OR d.session_id IS NULL)
      AND f.started_at>=${from} AND f.started_at<${to}
    ) SELECT s.id,s.category_id,a.project_id,a.goal_id,p.title,s.started_at,s.ended_at,s.seconds,s.completed,s.segment_id
      FROM slices s LEFT JOIN focus_attributions a ON a.session_id=s.id LEFT JOIN projects p ON p.id=a.project_id
      ORDER BY s.started_at,s.id`);
  return rows.flatMap((r) => {
    const start = Number(r[5]), end = Number(r[6]), legacy = r[9] == null;
    const clippedStart = legacy ? start : Math.max(start, from), clippedEnd = legacy ? end : Math.min(end, to);
    const seconds = Number(r[7]) * (legacy ? 1 : (clippedEnd - clippedStart) / Math.max(1, end - start));
    return seconds > 0 ? [{ sessionId: Number(r[0]), categoryId: r[1] == null ? null : Number(r[1]), projectId: r[2] == null ? null : Number(r[2]), goalId: r[3] == null ? null : Number(r[3]), projectTitle: r[4] == null ? null : String(r[4]), startedAt: clippedStart, endedAt: clippedEnd, seconds, completed: !!r[8] && (legacy || clippedEnd === end), legacy }] : [];
  });
}
export function splitFocusHours(rows: FocusSlice[]): Array<FocusSlice & { date: string; hour: number }> {
  const parts: Array<FocusSlice & { date: string; hour: number }> = [];
  for (const row of rows) {
    let cursor = row.startedAt;
    do {
      const d = new Date(cursor), next = new Date(cursor); next.setMinutes(60, 0, 0);
      const end = row.legacy ? cursor : Math.min(row.endedAt, Math.max(cursor + 1, next.getTime()));
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      parts.push({ ...row, startedAt: cursor, endedAt: end, seconds: row.legacy ? row.seconds : row.seconds * (end - cursor) / (row.endedAt - row.startedAt), completed: row.completed && (row.legacy || end === row.endedAt), date, hour: d.getHours() });
      cursor = end;
    } while (!row.legacy && cursor < row.endedAt);
  }
  return parts;
}
