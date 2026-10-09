CREATE TRIGGER IF NOT EXISTS inbox_restore_guard BEFORE UPDATE OF status ON notes
WHEN NEW.status='active' AND OLD.status='arranged'
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM inbox_links l JOIN tasks t ON t.id=l.task_id
    WHERE l.note_id=OLD.id AND (t.actual_duration>0
      OR EXISTS(SELECT 1 FROM focus_sessions f WHERE f.task_id=t.id)
      OR EXISTS(SELECT 1 FROM tasks child WHERE child.parent_id=t.id)))
    THEN RAISE(ABORT, 'inbox task has work; undo subsequent actions first') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS inbox_restore_source AFTER UPDATE OF status ON notes
WHEN NEW.status='active' AND OLD.status='arranged'
BEGIN
  DELETE FROM tasks WHERE id=(SELECT task_id FROM inbox_links WHERE note_id=OLD.id);
  DELETE FROM inbox_links WHERE note_id=OLD.id;
END;
