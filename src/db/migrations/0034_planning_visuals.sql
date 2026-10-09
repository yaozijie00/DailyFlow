CREATE TABLE IF NOT EXISTS task_planning_ranges (
  task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  start_day TEXT NOT NULL,
  end_day TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (end_day >= start_day)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planning_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  phase_id INTEGER REFERENCES long_term_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target_day TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  CHECK ((goal_id IS NOT NULL AND project_id IS NULL) OR (goal_id IS NULL AND project_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS inbox_links (
  note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  item_key TEXT,
  processed_at INTEGER NOT NULL
);
