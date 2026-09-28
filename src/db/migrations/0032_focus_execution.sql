CREATE TABLE IF NOT EXISTS focus_details (
 session_id INTEGER PRIMARY KEY REFERENCES focus_sessions(id) ON DELETE CASCADE,
 task_title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'finished',
 mode TEXT NOT NULL DEFAULT 'stopwatch', source TEXT NOT NULL DEFAULT 'legacy',
 goal_seconds INTEGER, elapsed_ms INTEGER NOT NULL DEFAULT 0,
 running_since INTEGER, paused_at INTEGER, checkpoint_at INTEGER NOT NULL,
 note TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '',
 interruption_count INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
-- The old timer persisted pause facts in settings rather than focus_sessions.
-- A known paused interval remains paused across upgrade; running/offline time needs confirmation.
WITH old_active AS (
 SELECT CASE WHEN json_valid(value) THEN value ELSE '{}' END AS value
 FROM settings WHERE key='active_focus'
), legacy AS (
 SELECT f.*, t.title,
  CASE WHEN json_extract(a.value,'$.sessionId')=f.id
   THEN MAX(0,COALESCE(json_extract(a.value,'$.accumulatedPauseMs'),0)) ELSE 0 END AS known_pause,
  CASE WHEN json_extract(a.value,'$.sessionId')=f.id
   AND json_type(a.value,'$.pausedAt') IN ('integer','real')
   AND json_extract(a.value,'$.pausedAt')>=f.started_at
   THEN CAST(json_extract(a.value,'$.pausedAt') AS INTEGER) ELSE NULL END AS known_paused_at
 FROM focus_sessions f LEFT JOIN tasks t ON t.id=f.task_id LEFT JOIN old_active a ON 1=1
)
INSERT OR IGNORE INTO focus_details(session_id,task_title,status,source,goal_seconds,elapsed_ms,paused_at,checkpoint_at)
 SELECT id,COALESCE(title,'已删除任务'),
 CASE WHEN ended_at IS NOT NULL THEN 'finished' WHEN known_paused_at IS NOT NULL THEN 'paused' ELSE 'recovery' END,
 'legacy',planned_duration,
 CASE WHEN ended_at IS NULL AND known_paused_at IS NOT NULL
  THEN MAX(COALESCE(actual_duration,0)*1000,known_paused_at-started_at-known_pause,0)
  ELSE MAX(0,COALESCE(actual_duration,0)*1000) END,
 CASE WHEN ended_at IS NULL THEN known_paused_at ELSE NULL END,
 COALESCE(ended_at,known_paused_at,started_at+known_pause+MAX(0,COALESCE(actual_duration,0)*1000))
 FROM legacy;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS focus_one_active ON focus_details((1)) WHERE status IN ('running','paused');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS focus_segments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
 started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, effective_ms INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS focus_segments_period ON focus_segments(started_at,ended_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS focus_segments_session ON focus_segments(session_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS focus_operations(operation_id TEXT PRIMARY KEY, request_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
-- Protect active work even when a Task is deleted through an older entry point.
CREATE TRIGGER IF NOT EXISTS focus_guard_task_delete BEFORE DELETE ON tasks
 WHEN EXISTS(SELECT 1 FROM focus_sessions f JOIN focus_details d ON d.session_id=f.id WHERE f.task_id=OLD.id AND d.status IN ('running','paused','recovery'))
 BEGIN SELECT RAISE(ABORT,'请先结束该任务的专注，再删除任务'); END;

--> statement-breakpoint
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
