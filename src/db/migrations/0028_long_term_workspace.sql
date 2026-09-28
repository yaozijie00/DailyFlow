-- Additive migration. Existing Goal/Project/Task IDs and user data remain intact.
CREATE TABLE IF NOT EXISTS planning_meta (
 key TEXT PRIMARY KEY NOT NULL,
 goal_id INTEGER UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
 project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
 lifecycle TEXT NOT NULL DEFAULT 'idea' CHECK (lifecycle IN ('idea','not_started','preparation','ready','active','paused','completed','archived')),
 paused_from TEXT,
 description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'p2',
 weekly_target_minutes INTEGER NOT NULL DEFAULT 0 CHECK (weekly_target_minutes BETWEEN 0 AND 10080),
 target_date TEXT, manual_progress INTEGER CHECK (manual_progress BETWEEN 0 AND 100),
 next_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
 preparation_json TEXT NOT NULL DEFAULT '[]', project_folder TEXT, workflow_run_id TEXT,
 archived_at INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 CHECK ((goal_id IS NOT NULL AND project_id IS NULL AND key = 'plan:' || goal_id)
     OR (project_id IS NOT NULL AND goal_id IS NULL AND key = 'project:' || project_id))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_weeks (
 item_key TEXT NOT NULL REFERENCES planning_meta(key) ON DELETE CASCADE,
 week_start TEXT NOT NULL, original_minutes INTEGER NOT NULL CHECK(original_minutes BETWEEN 0 AND 10080),
 target_minutes INTEGER NOT NULL CHECK(target_minutes BETWEEN 0 AND 10080),
 intention TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(item_key,week_start)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_changes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, item_key TEXT NOT NULL, field TEXT NOT NULL,
 old_value TEXT, new_value TEXT, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planning_changes_item ON planning_changes(item_key,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planning_week_created AFTER INSERT ON planning_weeks BEGIN
 INSERT INTO planning_changes(item_key,field,new_value,reason,created_at)
 VALUES(NEW.item_key,'weekly_target',json_object('week',NEW.week_start,'minutes',NEW.target_minutes),NEW.reason,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planning_week_changed AFTER UPDATE ON planning_weeks
 WHEN NEW.target_minutes != OLD.target_minutes OR NEW.intention != OLD.intention BEGIN
 INSERT INTO planning_changes(item_key,field,old_value,new_value,reason,created_at)
 VALUES(NEW.item_key,'weekly_target',json_object('week',OLD.week_start,'minutes',OLD.target_minutes,'intention',OLD.intention),
 json_object('week',NEW.week_start,'minutes',NEW.target_minutes,'intention',NEW.intention),NEW.reason,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planning_meta_changed AFTER UPDATE ON planning_meta
 WHEN NEW.lifecycle != OLD.lifecycle OR NEW.weekly_target_minutes != OLD.weekly_target_minutes
 OR NEW.priority != OLD.priority OR NEW.target_date IS NOT OLD.target_date OR NEW.archived_at IS NOT OLD.archived_at BEGIN
 INSERT INTO planning_changes(item_key,field,old_value,new_value,created_at)
 VALUES(NEW.key,'settings',json_object('status',OLD.lifecycle,'weeklyMinutes',OLD.weekly_target_minutes,'priority',OLD.priority,'targetDate',OLD.target_date,'archivedAt',OLD.archived_at),
 json_object('status',NEW.lifecycle,'weeklyMinutes',NEW.weekly_target_minutes,'priority',NEW.priority,'targetDate',NEW.target_date,'archivedAt',NEW.archived_at),NEW.updated_at);
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_reviews (
 id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('week','month','item')),
 period_start TEXT NOT NULL, period_end TEXT NOT NULL, item_key TEXT,
 snapshot_json TEXT NOT NULL, decisions_json TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', confirmed_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planning_reviews_period ON planning_reviews(period_start,period_end);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS focus_attributions (
 session_id INTEGER PRIMARY KEY REFERENCES focus_sessions(id) ON DELETE CASCADE,
 goal_id INTEGER, project_id INTEGER, phase_id INTEGER, inferred INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
-- Old attribution is inferred from current task links, not presented as known history.
INSERT OR IGNORE INTO focus_attributions(session_id,goal_id,project_id,phase_id,inferred)
 SELECT f.id,t.goal_id,t.project_id,t.phase_id,1 FROM focus_sessions f LEFT JOIN tasks t ON t.id=f.task_id;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS capture_focus_attribution AFTER INSERT ON focus_sessions BEGIN
 INSERT OR IGNORE INTO focus_attributions(session_id,goal_id,project_id,phase_id,inferred)
 SELECT NEW.id,t.goal_id,t.project_id,t.phase_id,0 FROM tasks t WHERE t.id=NEW.task_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS remove_focus_attribution AFTER DELETE ON focus_sessions BEGIN
 DELETE FROM focus_attributions WHERE session_id=OLD.id;
END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_focus_attribution_goal ON focus_attributions(goal_id,session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_focus_attribution_project ON focus_attributions(project_id,session_id);
