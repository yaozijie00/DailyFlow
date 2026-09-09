import { and, eq } from "drizzle-orm";
import type {
  Course,
  WeekSlot,
  SlotView,
  CreateCourseInput,
} from "../../../../db/repositories/courseRepository";
import { extCourses, extWeeklySlots, extTaskLinks } from "./schema";
import type { ExtDb } from "./bridge";
import { openExtensionDb } from "./dbLoader";

/**
 * 课程表 Extension 的存储仓库：所有课程数据读写都落在「扩展独立库」（ExtDb）。
 * 实现与 Core 旧 CourseRepository 同接口（见 core CourseStoragePort），
 * 供课程表 Extension 的 store/service 使用；Core 不再维护课程数据。
 */
export class ExtensionCourseRepository {
  constructor(
    private readonly getDb: () => Promise<ExtDb> = () => openExtensionDb(),
  ) {}

  private async db(): Promise<ExtDb> {
    return this.getDb();
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const now = Date.now();
    const rows = await (await this.db())
      .insert(extCourses)
      .values({
        title: input.title,
        categoryId: input.categoryId ?? null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    return rows[0] as unknown as Course;
  }

  async listCourses(): Promise<Course[]> {
    const rows = await (await this.db()).select().from(extCourses).orderBy(extCourses.title).all();
    return rows as unknown as Course[];
  }

  async findCourse(id: number): Promise<Course | null> {
    const row = await (await this.db())
      .select()
      .from(extCourses)
      .where(eq(extCourses.id, id))
      .get();
    return (row as unknown as Course | undefined) ?? null;
  }

  /** 删除课程（含其全部每周时段）；返回快照供撤销。 */
  async deleteCourse(id: number): Promise<{ course: Course | null; slots: WeekSlot[] }> {
    const db = await this.db();
    const course = (await db.select().from(extCourses).where(eq(extCourses.id, id)).get()) as
      | Course
      | undefined;
    const slots = (await db
      .select()
      .from(extWeeklySlots)
      .where(eq(extWeeklySlots.courseId, id))
      .all()) as unknown as WeekSlot[];
    await db.delete(extWeeklySlots).where(eq(extWeeklySlots.courseId, id)).run();
    await db.delete(extCourses).where(eq(extCourses.id, id)).run();
    return { course: course ?? null, slots };
  }

  async insertRestoredCourse(course: Course): Promise<void> {
    await (await this.db())
      .insert(extCourses)
      .values({
        id: course.id,
        title: course.title,
        categoryId: course.categoryId,
        sortOrder: course.sortOrder,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      })
      .run();
  }

  async insertRestoredSlots(slots: WeekSlot[]): Promise<void> {
    if (slots.length === 0) return;
    const db = await this.db();
    for (const s of slots) {
      await db
        .insert(extWeeklySlots)
        .values({
          id: s.id,
          courseId: s.courseId,
          weekday: s.weekday,
          startMinutes: s.startMinutes,
          durationMinutes: s.durationMinutes,
          createdAt: s.createdAt,
        })
        .run();
    }
  }

  /* ---------- 每周时段 ---------- */

  async slotsByCourse(courseId: number): Promise<WeekSlot[]> {
    const rows = await (await this.db())
      .select()
      .from(extWeeklySlots)
      .where(eq(extWeeklySlots.courseId, courseId))
      .orderBy(extWeeklySlots.weekday, extWeeklySlots.startMinutes)
      .all();
    return rows as unknown as WeekSlot[];
  }

  async listSlotsView(): Promise<SlotView[]> {
    const db = await this.db();
    const slots = await db.select().from(extWeeklySlots).all();
    const courses = await db.select().from(extCourses).all();
    const titleById = new Map(courses.map((c) => [c.id, c.title]));
    const sorted = [...slots].sort(
      (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
    );
    return sorted.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      weekday: s.weekday,
      startMinutes: s.startMinutes,
      durationMinutes: s.durationMinutes,
      createdAt: s.createdAt,
      courseTitle: s.courseId != null ? (titleById.get(s.courseId) ?? null) : null,
      categoryColor: null, // 扩展库不存 Core 分类颜色（课程按自有色渲染）
    })) as unknown as SlotView[];
  }

  async createSlot(input: {
    courseId: number;
    weekday: number;
    startMinutes: number;
    durationMinutes?: number;
  }): Promise<WeekSlot> {
    const rows = await (await this.db())
      .insert(extWeeklySlots)
      .values({
        courseId: input.courseId,
        weekday: input.weekday,
        startMinutes: input.startMinutes,
        durationMinutes: input.durationMinutes ?? 60,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return rows[0] as unknown as WeekSlot;
  }

  async updateSlot(
    id: number,
    patch: Partial<Pick<WeekSlot, "weekday" | "startMinutes" | "durationMinutes" | "courseId">>,
  ): Promise<WeekSlot | null> {
    const rows = await (await this.db())
      .update(extWeeklySlots)
      .set(patch)
      .where(eq(extWeeklySlots.id, id))
      .returning()
      .all();
    return (rows[0] as unknown as WeekSlot | undefined) ?? null;
  }

  async deleteSlot(id: number): Promise<boolean> {
    const rows = await (await this.db())
      .delete(extWeeklySlots)
      .where(eq(extWeeklySlots.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  async findSlot(id: number): Promise<WeekSlot | null> {
    const row = await (await this.db())
      .select()
      .from(extWeeklySlots)
      .where(eq(extWeeklySlots.id, id))
      .get();
    return (row as unknown as WeekSlot | undefined) ?? null;
  }

  async insertRestoredSlot(slot: WeekSlot): Promise<void> {
    await (await this.db())
      .insert(extWeeklySlots)
      .values({
        id: slot.id,
        courseId: slot.courseId,
        weekday: slot.weekday,
        startMinutes: slot.startMinutes,
        durationMinutes: slot.durationMinutes,
        createdAt: slot.createdAt,
      })
      .run();
  }

  /* ---------- 任务映射（task_links：taskId ↔ course，任务本体在 Core） ---------- */

  /** 记录「课程任务」引用（幂等）。 */
  async recordTaskLink(taskId: number, courseId: number): Promise<void> {
    const db = await this.db();
    const exists = await db
      .select({ id: extTaskLinks.id })
      .from(extTaskLinks)
      .where(and(eq(extTaskLinks.taskId, taskId), eq(extTaskLinks.courseId, courseId)))
      .limit(1)
      .get();
    if (exists) return;
    await db.insert(extTaskLinks).values({ taskId, courseId, createdAt: Date.now() }).run();
  }

  /** 某课程关联的任务 id 列表。 */
  async taskIdsForCourse(courseId: number): Promise<number[]> {
    const rows = await (await this.db())
      .select({ taskId: extTaskLinks.taskId })
      .from(extTaskLinks)
      .where(eq(extTaskLinks.courseId, courseId))
      .all();
    return rows.map((r) => r.taskId);
  }

  /** 全部课程关联任务 id（成就 Provider 用）。 */
  async taskIdsAll(): Promise<number[]> {
    const rows = await (await this.db())
      .select({ taskId: extTaskLinks.taskId })
      .from(extTaskLinks)
      .all();
    return rows.map((r) => r.taskId);
  }

  /** 按任务回查所属课程（撤销/删除任务时无需清理——映射按需查询，天然幂等）。 */
  async courseIdForTask(taskId: number): Promise<number | null> {
    const row = await (await this.db())
      .select({ courseId: extTaskLinks.courseId })
      .from(extTaskLinks)
      .where(eq(extTaskLinks.taskId, taskId))
      .limit(1)
      .get();
    return row?.courseId ?? null;
  }

  /** 按任务 id 删除映射（任务被删除/撤销时由 Core 集成清理；A1-P0Fix-③）。 */
  async removeTaskLinksByTaskId(taskId: number): Promise<void> {
    await (await this.db())
      .delete(extTaskLinks)
      .where(eq(extTaskLinks.taskId, taskId))
      .run();
  }

  /** 全部 task_links 的 taskId（孤儿清扫用）。 */
  async allTaskLinkIds(): Promise<number[]> {
    const rows = await (await this.db())
      .select({ taskId: extTaskLinks.taskId })
      .from(extTaskLinks)
      .all();
    return rows.map((r) => r.taskId);
  }
}

/** 便于注入：与 Core CourseRepository 的存储方法子集一致。 */
export type CourseStoragePort = Pick<
  ExtensionCourseRepository,
  | "listCourses"
  | "listSlotsView"
  | "createCourse"
  | "deleteCourse"
  | "insertRestoredCourse"
  | "insertRestoredSlots"
  | "findSlot"
  | "createSlot"
  | "updateSlot"
  | "deleteSlot"
  | "insertRestoredSlot"
  | "recordTaskLink"
  | "taskIdsForCourse"
>;
