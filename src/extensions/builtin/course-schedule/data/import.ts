import { eq } from "drizzle-orm";
import { extCourses, extWeeklySlots, extTaskLinks } from "./schema";
import type { ExtDb } from "./bridge";

/** 来自 Core 旧表的课程（迁移源；Host 侧提供）。 */
export interface LegacyCourseSource {
  id: number;
  title: string;
  categoryId: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** 来自 Core 旧表的每周时段（迁移源）。 */
export interface LegacySlotSource {
  id: number;
  courseId: number | null;
  weekday: number;
  startMinutes: number;
  durationMinutes: number;
  createdAt: number;
}

export interface LegacySource {
  courses: LegacyCourseSource[];
  slots: LegacySlotSource[];
}

/**
 * 一次性命中导入：仅在扩展库为空时把 Core 旧表数据复制过来（幂等）。
 * 显式保留原 id（AUTOINCREMENT 接受），使 course_id 引用在槽位中保持有效。
 */
export async function importLegacyIfEmpty(
  db: ExtDb,
  source: LegacySource,
): Promise<{ importedCourses: number; importedSlots: number }> {
  const existing = await db.select({ id: extCourses.id }).from(extCourses).limit(1).all();
  if (existing.length > 0) {
    return { importedCourses: 0, importedSlots: 0 };
  }
  if (source.courses.length > 0) {
    await db
      .insert(extCourses)
      .values(
        source.courses.map((c) => ({
          id: c.id,
          title: c.title,
          categoryId: c.categoryId,
          sortOrder: c.sortOrder,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      )
      .run();
  }
  if (source.slots.length > 0) {
    await db
      .insert(extWeeklySlots)
      .values(
        source.slots.map((s) => ({
          id: s.id,
          courseId: s.courseId,
          weekday: s.weekday,
          startMinutes: s.startMinutes,
          durationMinutes: s.durationMinutes,
          createdAt: s.createdAt,
        })),
      )
      .run();
  }
  return { importedCourses: source.courses.length, importedSlots: source.slots.length };
}

/** 扩展库当前课程/槽位数（导入校验用）。 */
export async function countExtensionRows(
  db: ExtDb,
): Promise<{ courses: number; slots: number }> {
  const cs = await db.select({ id: extCourses.id }).from(extCourses).all();
  const ss = await db.select({ id: extWeeklySlots.id }).from(extWeeklySlots).all();
  return { courses: cs.length, slots: ss.length };
}

/**
 * 回填 task_links：从 Core 旧 tasks.course_id 关联一次性补齐映射（幂等，
 * 已存在的组合跳过）。此后课程任务关联以扩展库 task_links 为准。
 */
export async function backfillTaskLinks(
  db: ExtDb,
  pairs: Array<{ taskId: number; courseId: number }>,
): Promise<number> {
  if (pairs.length === 0) return 0;
  const existingRows = await db
    .select({ taskId: extTaskLinks.taskId, courseId: extTaskLinks.courseId })
    .from(extTaskLinks)
    .all();
  const existing = new Set(existingRows.map((r) => `${r.taskId}:${r.courseId}`));
  let inserted = 0;
  for (const p of pairs) {
    const key = `${p.taskId}:${p.courseId}`;
    if (existing.has(key)) continue;
    await db.insert(extTaskLinks).values({ taskId: p.taskId, courseId: p.courseId, createdAt: Date.now() }).run();
    existing.add(key);
    inserted += 1;
  }
  return inserted;
}

/**
 * 孤儿映射清扫（A1-P0Fix-③）：删除 task_links 中指向【Core 已不存在任务】的行。
 * 场景：任务被撤销删除、或恢复主库旧备份使任务 id 回退——若课程库未同刻回退则产生悬空映射，
 * 会污染课程周完成率与成就计数。Core 任务经 listByIds 回查（只读，不触碰任务数据）。
 * 幂等：每次扩展初始化执行。
 */
export async function sweepOrphanTaskLinks(
  db: ExtDb,
  lookupTasks: (ids: number[]) => Promise<Array<{ id: number; status: string }>>,
): Promise<number> {
  const rows = await db
    .select({ id: extTaskLinks.id, taskId: extTaskLinks.taskId })
    .from(extTaskLinks)
    .all();
  if (rows.length === 0) return 0;
  const ids = Array.from(new Set(rows.map((r) => r.taskId)));
  const alive = await lookupTasks(ids);
  const aliveSet = new Set(alive.map((a) => a.id));
  const orphanIds = rows.filter((r) => !aliveSet.has(r.taskId)).map((r) => r.id);
  if (orphanIds.length === 0) return 0;
  for (const id of orphanIds) {
    await db.delete(extTaskLinks).where(eq(extTaskLinks.id, id)).run();
  }
  return orphanIds.length;
}
