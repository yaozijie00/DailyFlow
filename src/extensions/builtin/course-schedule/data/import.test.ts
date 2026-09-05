import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  initExtensionSchema,
  makeExtDb,
  type ExtDb,
  type ExtSqlClient,
} from "./bridge";
import {
  importLegacyIfEmpty,
  countExtensionRows,
  backfillTaskLinks,
  sweepOrphanTaskLinks,
} from "./import";
import { extCourses, extWeeklySlots, extTaskLinks } from "./schema";

function makeTestClient(): { client: ExtSqlClient; db: ExtDb; close: () => void } {
  const raw = new Database(":memory:");
  const client: ExtSqlClient = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (sql, params = []) => raw.prepare(sql).run(...(params as any[])),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: async (sql, params = []) =>
      raw.prepare(sql).all(...(params as any[])) as Array<Record<string, unknown>>,
  };
  return {
    client,
    db: makeExtDb(() => Promise.resolve(client)),
    close: () => raw.close(),
  };
}

describe("课程表独立库：建表与一次性命中导入", () => {
  let t: ReturnType<typeof makeTestClient>;

  beforeEach(async () => {
    t = makeTestClient();
    await initExtensionSchema(t.client);
  });

  afterEach(() => t.close());

  it("空库导入：复制 courses/weekly_slots 且保留原 id 与 course 引用", async () => {
    const result = await importLegacyIfEmpty(t.db, {
      courses: [
        { id: 1, title: "数据结构", categoryId: null, sortOrder: 0, createdAt: 1, updatedAt: 2 },
        { id: 2, title: "英语", categoryId: 3, sortOrder: 1, createdAt: 3, updatedAt: 4 },
      ],
      slots: [
        { id: 10, courseId: 1, weekday: 1, startMinutes: 540, durationMinutes: 90, createdAt: 5 },
        { id: 11, courseId: 2, weekday: 3, startMinutes: 600, durationMinutes: 60, createdAt: 6 },
      ],
    });
    expect(result).toEqual({ importedCourses: 2, importedSlots: 2 });
    const courses = await t.db.select().from(extCourses).all();
    const slots = await t.db.select().from(extWeeklySlots).all();
    expect(courses.length).toBe(2);
    expect(courses.find((c) => c.id === 1)?.title).toBe("数据结构");
    expect(slots.find((s) => s.id === 11)?.courseId).toBe(2); // 引用保持有效
  });

  it("幂等：非空库不重复导入", async () => {
    await importLegacyIfEmpty(t.db, {
      courses: [{ id: 1, title: "数据结构", categoryId: null, sortOrder: 0, createdAt: 1, updatedAt: 2 }],
      slots: [],
    });
    const second = await importLegacyIfEmpty(t.db, {
      courses: [{ id: 9, title: "新课程", categoryId: null, sortOrder: 0, createdAt: 1, updatedAt: 2 }],
      slots: [],
    });
    expect(second).toEqual({ importedCourses: 0, importedSlots: 0 });
    expect(await countExtensionRows(t.db)).toEqual({ courses: 1, slots: 0 });
  });

  it("countExtensionRows 统计", async () => {
    await importLegacyIfEmpty(t.db, {
      courses: [{ id: 1, title: "A", categoryId: null, sortOrder: 0, createdAt: 1, updatedAt: 2 }],
      slots: [
        { id: 5, courseId: 1, weekday: 2, startMinutes: 600, durationMinutes: 60, createdAt: 3 },
      ],
    });
    expect(await countExtensionRows(t.db)).toEqual({ courses: 1, slots: 1 });
  });

  it("backfillTaskLinks：从旧 tasks.course_id 回填映射（幂等）", async () => {
    const inserted = await backfillTaskLinks(t.db, [
      { taskId: 11, courseId: 3 },
      { taskId: 12, courseId: 3 },
      { taskId: 13, courseId: 4 },
    ]);
    expect(inserted).toBe(3);
    const again = await backfillTaskLinks(t.db, [
      { taskId: 11, courseId: 3 },
      { taskId: 99, courseId: 3 },
    ]);
    expect(again).toBe(1); // 只补新增
    const rows = await t.db.select().from(extTaskLinks).all();
    expect(rows).toHaveLength(4);
  });

  it("A1：sweepOrphanTaskLinks 删除指向不存在任务的映射（幂等）", async () => {
    await backfillTaskLinks(t.db, [
      { taskId: 11, courseId: 3 }, // Core 中存在
      { taskId: 12, courseId: 3 }, // 孤儿（已删除）
      { taskId: 13, courseId: 4 }, // Core 中存在
    ]);
    // 模拟 ctx.tasks.listByIds：只回 11/13（12 已从 Core 删除）
    const lookup = async (ids: number[]) =>
      ids.filter((i) => i === 11 || i === 13).map((id) => ({ id, status: "TODO" }));
    const removed = await sweepOrphanTaskLinks(t.db, lookup);
    expect(removed).toBe(1);
    const left = await t.db.select({ taskId: extTaskLinks.taskId }).from(extTaskLinks).all();
    expect(left.map((r) => r.taskId).sort()).toEqual([11, 13]);

    // 幂等：再跑无新删除
    const again = await sweepOrphanTaskLinks(t.db, lookup);
    expect(again).toBe(0);
  });
});
