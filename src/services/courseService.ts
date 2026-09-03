import {
  CourseRepository,
  type Course,
  type SlotView,
  type WeekSlot,
  type CreateCourseInput,
} from "../db/repositories/courseRepository";
import { TaskRepository } from "../db/repositories/taskRepository";
import { undoManager } from "../lib/undoManager";

/** 周一起的日期上加 weekday(1..7) → 该周目标日（YYYY-MM-DD）。 */
function dateAtMonday(fromDate: string, weekday: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate);
  if (!m) return fromDate;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (weekday - 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 课程业务逻辑（2.0.x Course Schedule）。
 * 课程创建/删除（含时段还原）、时段增删改均接入 Undo。
 */
export class CourseService {
  constructor(
    private readonly repo: CourseRepository,
    private readonly tasks: TaskRepository,
  ) {}

  async listCourses(): Promise<Course[]> {
    return this.repo.listCourses();
  }

  async listSlots(): Promise<SlotView[]> {
    return this.repo.listSlotsView();
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const course = await this.repo.createCourse(input);
    if (!undoManager.applying) {
      const snapshot = { ...course };
      undoManager.push({
        type: "course.create",
        label: "创建课程",
        undo: async () => {
          await this.repo.deleteCourse(snapshot.id);
        },
        redo: async () => {
          await this.repo.insertRestoredCourse(snapshot);
        },
      });
    }
    return course;
  }

  /** 删除课程（连同其每周时段；撤销 = 整单还原）。 */
  async deleteCourse(id: number): Promise<boolean> {
    const result = await this.repo.deleteCourse(id);
    if (!result.course) return false;
    if (!undoManager.applying) {
      const course = { ...result.course };
      const slots = result.slots.map((s) => ({ ...s }));
      undoManager.push({
        type: "course.delete",
        label: "删除课程",
        undo: async () => {
          await this.repo.insertRestoredCourse(course);
          await this.repo.insertRestoredSlots(slots);
        },
        redo: async () => {
          await this.repo.deleteCourse(course.id);
        },
      });
    }
    return true;
  }

  async addSlot(input: {
    courseId: number;
    weekday: number;
    startMinutes: number;
    durationMinutes?: number;
  }): Promise<WeekSlot> {
    const slot = await this.repo.createSlot(input);
    if (!undoManager.applying) {
      const snapshot = { ...slot };
      undoManager.push({
        type: "slot.create",
        label: "添加课程安排",
        undo: async () => {
          await this.repo.deleteSlot(snapshot.id);
        },
        redo: async () => {
          await this.repo.insertRestoredSlot(snapshot);
        },
      });
    }
    return slot;
  }

  async updateSlot(
    id: number,
    patch: Partial<Pick<WeekSlot, "weekday" | "startMinutes" | "durationMinutes" | "courseId">>,
  ): Promise<WeekSlot | null> {
    const before = await this.repo.findSlot(id);
    const after = await this.repo.updateSlot(id, patch);
    if (after && before && !undoManager.applying) {
      const diffFields = ["weekday", "startMinutes", "durationMinutes", "courseId"] as const;
      const changed = diffFields.some((f) => before[f] !== after[f]);
      if (changed) {
        const beforeSnap = { ...before };
        undoManager.push({
          type: "slot.update",
          label: "调整课程安排",
          undo: async () => {
            await this.repo.updateSlot(id, {
              weekday: beforeSnap.weekday,
              startMinutes: beforeSnap.startMinutes,
              durationMinutes: beforeSnap.durationMinutes,
              courseId: beforeSnap.courseId,
            });
          },
          redo: async () => {
            await this.repo.updateSlot(id, {
              weekday: after.weekday,
              startMinutes: after.startMinutes,
              durationMinutes: after.durationMinutes,
              courseId: after.courseId,
            });
          },
        });
      }
    }
    return after;
  }

  async deleteSlot(id: number): Promise<boolean> {
    if (!undoManager.applying) {
      const slot = await this.repo.findSlot(id);
      if (slot) {
        const snapshot = { ...slot };
        undoManager.push({
          type: "slot.delete",
          label: "删除课程安排",
          undo: async () => {
            await this.repo.insertRestoredSlot(snapshot);
          },
          redo: async () => {
            await this.repo.deleteSlot(id);
          },
        });
      }
    }
    return this.repo.deleteSlot(id);
  }

  /**
   * 本周课程完成状态（2.0.x）：fromDate=周一 ~ toDate=周日。
   * 完成 = 该时段对应的星期内出现了「归属该课程且已完成」的任务。
   */
  async getWeekProgress(
    fromDate: string,
    toDate: string,
  ): Promise<Array<{ courseId: number; title: string; occurrences: number; completed: number }>> {
    const slots = await this.repo.listSlotsView();
    const byCourse = new Map<
      number,
      { title: string; occurrences: number; dates: Set<string> }
    >();
    for (const s of slots) {
      if (s.courseId == null) continue;
      const cur = byCourse.get(s.courseId) ?? {
        title: s.courseTitle ?? "课程",
        occurrences: 0,
        dates: new Set<string>(),
      };
      cur.occurrences += 1;
      cur.dates.add(dateAtMonday(fromDate, s.weekday));
      byCourse.set(s.courseId, cur);
    }
    const out: Array<{ courseId: number; title: string; occurrences: number; completed: number }> = [];
    for (const [courseId, cur] of byCourse) {
      const doneDates = await this.tasks.findCompletedDatesByCourse(courseId, fromDate, toDate);
      const completed = doneDates.filter((d) => cur.dates.has(d)).length;
      out.push({
        courseId,
        title: cur.title,
        occurrences: cur.occurrences,
        completed,
      });
    }
    out.sort((a, b) => b.occurrences - a.occurrences || a.title.localeCompare(b.title));
    return out;
  }
}
