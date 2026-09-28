-- Keep existing task forms/Goal services and the new workspace in agreement.
-- Synchronization executes in the same SQLite statement as the originating edit.
CREATE TRIGGER IF NOT EXISTS planning_meta_to_goal AFTER UPDATE ON planning_meta
WHEN NEW.goal_id IS NOT NULL BEGIN
 UPDATE goals SET
  description=NEW.description, priority=NEW.priority, weekly_target_minutes=NEW.weekly_target_minutes,
  deadline=NEW.target_date, manual_progress=NEW.manual_progress,
  progress_mode=CASE WHEN NEW.manual_progress IS NOT NULL THEN 'manual' WHEN OLD.manual_progress IS NOT NULL THEN 'estimated' ELSE progress_mode END,
  status=CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' WHEN NEW.lifecycle IN ('idea','preparation','ready') THEN 'not_started' ELSE NEW.lifecycle END,
  paused_at=CASE WHEN NEW.lifecycle='paused' THEN coalesce(paused_at,NEW.updated_at) ELSE NULL END,
  completed_at=CASE WHEN NEW.lifecycle='completed' THEN coalesce(completed_at,NEW.updated_at) WHEN NEW.archived_at IS NOT NULL THEN completed_at ELSE NULL END,
  updated_at=NEW.updated_at
 WHERE id=NEW.goal_id AND (
  coalesce(description,'') IS NOT NEW.description OR priority IS NOT NEW.priority
  OR weekly_target_minutes IS NOT NEW.weekly_target_minutes OR deadline IS NOT NEW.target_date
  OR manual_progress IS NOT NEW.manual_progress
  OR status IS NOT (CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' WHEN NEW.lifecycle IN ('idea','preparation','ready') THEN 'not_started' ELSE NEW.lifecycle END)
 );
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS goal_to_planning_meta AFTER UPDATE ON goals
WHEN NEW.status IS NOT OLD.status OR NEW.description IS NOT OLD.description
 OR NEW.priority IS NOT OLD.priority OR NEW.weekly_target_minutes IS NOT OLD.weekly_target_minutes
 OR NEW.deadline IS NOT OLD.deadline OR NEW.manual_progress IS NOT OLD.manual_progress BEGIN
 UPDATE planning_meta SET
  description=coalesce(NEW.description,''),priority=NEW.priority,weekly_target_minutes=NEW.weekly_target_minutes,
  target_date=NEW.deadline,manual_progress=NEW.manual_progress,
  lifecycle=CASE WHEN NEW.status='archived' THEN lifecycle
    WHEN NEW.status='not_started' AND lifecycle IN ('idea','preparation','ready') THEN lifecycle ELSE NEW.status END,
  archived_at=CASE WHEN NEW.status='archived' THEN coalesce(archived_at,NEW.updated_at) ELSE NULL END,
  updated_at=NEW.updated_at
 WHERE goal_id=NEW.id;
END;
