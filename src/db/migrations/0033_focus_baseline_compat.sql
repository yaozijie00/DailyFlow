-- Compatibility for early V3.3 preview databases that already applied 0032.
-- Preserve only legacy cache time that cannot be traced to saved sessions.
-- Deliberately no FK: deleting/undoing a Task must retain its audited baseline.
CREATE TABLE IF NOT EXISTS focus_task_baselines (
 task_id INTEGER PRIMARY KEY,
 untracked_seconds INTEGER NOT NULL DEFAULT 0 CHECK(untracked_seconds >= 0)
);
--> statement-breakpoint
INSERT OR IGNORE INTO focus_task_baselines(task_id,untracked_seconds)
 SELECT t.id,MAX(0,COALESCE(t.actual_duration,0)-COALESCE((
  SELECT SUM(f.actual_duration) FROM focus_sessions f WHERE f.task_id=t.id AND f.ended_at IS NOT NULL
 ),0)) FROM tasks t;
--> statement-breakpoint
-- Repair undercounts while preserving the explicit, non-session legacy baseline.
UPDATE tasks SET actual_duration=
 COALESCE((SELECT untracked_seconds FROM focus_task_baselines WHERE task_id=tasks.id),0)
 +COALESCE((SELECT SUM(actual_duration) FROM focus_sessions WHERE task_id=tasks.id AND ended_at IS NOT NULL),0);
