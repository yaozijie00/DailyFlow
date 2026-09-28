-- A materialized action is identified by Task ID; do not recreate consumed legacy text.
CREATE TRIGGER IF NOT EXISTS bind_planning_next_task AFTER UPDATE OF next_task_id ON planning_meta
 WHEN NEW.goal_id IS NOT NULL AND NEW.next_task_id IS NOT NULL BEGIN
 UPDATE goals SET next_action=NULL WHERE id=NEW.goal_id AND next_action IS NOT NULL;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS edit_legacy_next_action AFTER UPDATE OF next_action ON goals
 WHEN NEW.next_action IS NOT NULL AND NEW.next_action IS NOT OLD.next_action BEGIN
 UPDATE planning_meta SET next_task_id=NULL WHERE goal_id=NEW.id;
END;
