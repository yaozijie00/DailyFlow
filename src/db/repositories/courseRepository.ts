import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { categories, courses, weeklySlots } from "../schema";

export type Course = typeof courses.$inferSelect;
export type WeekSlot = typeof weeklySlots.$inferSelect;

/** 课程表视图行：slot + 课程名/分类色（渲染用）。 */
export interface SlotView extends WeekSlot {
  courseTitle: string | null;
  categoryColor: string | null;
}

export interface CreateCourseInput {
  title: string;
  categoryId?: number | null;
}

export class CourseRepository {
  constructor(private readonly db: Db) {}

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const now = Date.now();
    const rows = await this.db
      .insert(courses)
      .values({
        title: input.title,
        categoryId: input.categoryId ?? null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    return rows[0];
  }

  async listCourses(): Promise<Course[]> {
    return this.db.select().from(courses).orderBy(courses.title).all();
  }

  async findCourse(id: number): Promise<Course | null> {
    const row = await this.db.select().from(courses).where(eq(courses.id, id)).get();
    return row ?? null;
  }

  /** 删除课程（含其全部每周时段）；返回快照供撤销。 */
  async deleteCourse(id: number): Promise<{ course: Course | null; slots: WeekSlot[] }> {
    const course = await this.findCourse(id);
    const slots = await this.slotsByCourse(id);
    await this.db.delete(weeklySlots).where(eq(weeklySlots.courseId, id)).run();
    await this.db.delete(courses).where(eq(courses.id, id)).run();
    return { course, slots };
  }

  async insertRestoredCourse(course: Course): Promise<void> {
    await this.db.insert(courses).values(course).run();
  }

  async insertRestoredSlots(slots: WeekSlot[]): Promise<void> {
    if (slots.length === 0) return;
    for (const s of slots) await this.db.insert(weeklySlots).values(s).run();
  }

  /* ---------- 每周时段 ---------- */

  async slotsByCourse(courseId: number): Promise<WeekSlot[]> {
    return this.db
      .select()
      .from(weeklySlots)
      .where(eq(weeklySlots.courseId, courseId))
      .orderBy(weeklySlots.weekday, weeklySlots.startMinutes)
      .all();
  }

  async listSlotsView(): Promise<SlotView[]> {
    return this.db
      .select({
        id: weeklySlots.id,
        courseId: weeklySlots.courseId,
        weekday: weeklySlots.weekday,
        startMinutes: weeklySlots.startMinutes,
        durationMinutes: weeklySlots.durationMinutes,
        createdAt: weeklySlots.createdAt,
        courseTitle: courses.title,
        categoryColor: categories.color,
      })
      .from(weeklySlots)
      .leftJoin(courses, eq(courses.id, weeklySlots.courseId))
      .leftJoin(categories, eq(categories.id, courses.categoryId))
      .orderBy(weeklySlots.weekday, weeklySlots.startMinutes)
      .all();
  }

  async createSlot(input: {
    courseId: number;
    weekday: number;
    startMinutes: number;
    durationMinutes?: number;
  }): Promise<WeekSlot> {
    const rows = await this.db
      .insert(weeklySlots)
      .values({
        courseId: input.courseId,
        weekday: input.weekday,
        startMinutes: input.startMinutes,
        durationMinutes: input.durationMinutes ?? 60,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return rows[0];
  }

  async updateSlot(
    id: number,
    patch: Partial<Pick<WeekSlot, "weekday" | "startMinutes" | "durationMinutes" | "courseId">>,
  ): Promise<WeekSlot | null> {
    const rows = await this.db
      .update(weeklySlots)
      .set(patch)
      .where(eq(weeklySlots.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async deleteSlot(id: number): Promise<boolean> {
    const rows = await this.db.delete(weeklySlots).where(eq(weeklySlots.id, id)).returning().all();
    return rows.length > 0;
  }

  async findSlot(id: number): Promise<WeekSlot | null> {
    const row = await this.db.select().from(weeklySlots).where(eq(weeklySlots.id, id)).get();
    return row ?? null;
  }

  async insertRestoredSlot(slot: WeekSlot): Promise<void> {
    await this.db.insert(weeklySlots).values(slot).run();
  }
}
