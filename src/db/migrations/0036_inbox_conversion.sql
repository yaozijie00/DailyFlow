ALTER TABLE tasks ADD COLUMN source_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS inbox_task_guard BEFORE INSERT ON tasks
WHEN NEW.source_note_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM notes WHERE id=NEW.source_note_id AND status='active')
    OR EXISTS (SELECT 1 FROM inbox_links WHERE note_id=NEW.source_note_id)
    THEN RAISE(ABORT, 'inbox item already processed') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS inbox_task_link AFTER INSERT ON tasks
WHEN NEW.source_note_id IS NOT NULL
BEGIN
  INSERT INTO inbox_links(note_id,task_id,item_key,processed_at)
    VALUES(NEW.source_note_id,NEW.id,CASE WHEN NEW.project_id IS NOT NULL THEN 'project:'||NEW.project_id WHEN NEW.goal_id IS NOT NULL THEN 'plan:'||NEW.goal_id ELSE NULL END,NEW.created_at);
  UPDATE notes SET status='arranged',updated_at=NEW.created_at WHERE id=NEW.source_note_id;
END;
