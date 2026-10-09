import type { Task } from "../db/repositories/taskRepository";

/** Parent rows summarize work; only non-cancelled leaves count as execution units. */
export function executionLeaves(rows: Task[]): Task[] {
  const parents = new Set(rows.filter((row) => row.status !== "CANCELLED" && row.parentId != null).map((row) => row.parentId));
  return rows.filter((row) => row.status !== "CANCELLED" && !parents.has(row.id));
}
export function taskOwner(task: Pick<Task, "projectId" | "goalId">): string | null {
  return task.projectId != null ? `project:${task.projectId}` : task.goalId != null ? `plan:${task.goalId}` : null;
}

/** Keep a parent's execution tree together even when a child's phase differs.
 * Legacy ancestry can contain cycles; visit each row at most once. */
export function executionDescendants(rows: Task[], parentId: number): Task[] {
  const children = new Map<number, Task[]>();
  for (const row of rows) {
    if (row.parentId != null) {
      const group = children.get(row.parentId) ?? [];
      group.push(row); children.set(row.parentId, group);
    }
  }
  const seen = new Set([parentId]), result: Task[] = [];
  const visit = (id: number) => {
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id); result.push(child); visit(child.id);
    }
  };
  visit(parentId);
  return result;
}

export function executionRoots(rows: Task[]): Task[] {
  const ids = new Set(rows.map((row) => row.id));
  return rows.filter((row) => row.parentId == null || !ids.has(row.parentId));
}
