import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { goals, projects, tasks } from "../schema";

export type Project = typeof projects.$inferSelect;

export interface CreateProjectInput {
  title: string;
  goalId?: number | null;
}

/** 项目 + 所属目标标题（左连；目标已删则为 null）。 */
export interface ProjectWithGoal extends Project {
  goalTitle: string | null;
}

export class ProjectRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const now = Date.now();
    const rows = await this.db
      .insert(projects)
      .values({
        title: input.title,
        goalId: input.goalId ?? null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    return rows[0];
  }

  async findById(id: number): Promise<Project | null> {
    const row = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    return row ?? null;
  }

  /** 全部项目（含所属目标标题），按目标 + sort_order + id。 */
  async findAllWithGoal(): Promise<ProjectWithGoal[]> {
    return this.db
      .select({
        id: projects.id,
        title: projects.title,
        goalId: projects.goalId,
        sortOrder: projects.sortOrder,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        goalTitle: goals.title,
      })
      .from(projects)
      .leftJoin(goals, eq(goals.id, projects.goalId))
      .orderBy(projects.goalId, projects.sortOrder, projects.id)
      .all();
  }

  /** 某目标下的项目（按创建先后）。 */
  async listByGoal(goalId: number): Promise<Project[]> {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.goalId, goalId))
      .orderBy(projects.sortOrder, projects.id)
      .all();
  }

  async update(id: number, input: { title?: string; goalId?: number | null; sortOrder?: number }): Promise<Project | null> {
    const rows = await this.db
      .update(projects)
      .set({ ...input, updatedAt: Date.now() })
      .where(eq(projects.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  /** 物理删除（关联任务保留，project_id 置空——显式解绑，不依赖 FK pragma）。 */
  async delete(id: number): Promise<boolean> {
    await this.db.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, id)).run();
    const rows = await this.db.delete(projects).where(eq(projects.id, id)).returning().all();
    return rows.length > 0;
  }

  /* ---------- 撤销支持 ---------- */

  /** 以显式 id 还原被删除的项目。 */
  async insertRestored(project: Project): Promise<void> {
    await this.db
      .insert(projects)
      .values({
        id: project.id,
        title: project.title,
        goalId: project.goalId,
        sortOrder: project.sortOrder,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })
      .run();
  }

  /** 关联到某项目的任务 id（撤销删除项目时恢复 project_id 关联）。 */
  async taskIdsByProject(projectId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .all();
    return rows.map((r) => r.id);
  }

  /** 把一批任务重新关联到项目。 */
  async relinkTasks(taskIds: number[], projectId: number): Promise<void> {
    if (taskIds.length === 0) return;
    await this.db.update(tasks).set({ projectId }).where(inArray(tasks.id, taskIds)).run();
  }
}
