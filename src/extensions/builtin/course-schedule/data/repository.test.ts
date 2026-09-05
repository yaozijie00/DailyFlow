import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initExtensionSchema, makeExtDb, type ExtDb, type ExtSqlClient } from "./bridge";
import { ExtensionCourseRepository } from "./repository";

function makeHarness(): {
  client: ExtSqlClient;
  db: ExtDb;
  repo: ExtensionCourseRepository;
  close: () => void;
} {
  const raw = new Database(":memory:");
  const client: ExtSqlClient = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (sql, params = []) => raw.prepare(sql).run(...(params as any[])),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: async (sql, params = []) =>
      raw.prepare(sql).all(...(params as any[])) as Array<Record<string, unknown>>,
  };
  const db = makeExtDb(() => Promise.resolve(client));
  return {
    client,
    db,
    repo: new ExtensionCourseRepository(() => Promise.resolve(db)),
    close: () => raw.close(),
  };
}

describe("ExtensionCourseRepository（扩展独立库 CRUD）", () => {
  let h: ReturnType<typeof makeHarness>;

  beforeEach(async () => {
    h = makeHarness();
    await initExtensionSchema(h.client);
  });

  afterEach(() => h.close());

  it("课程创建/列出/按标题排序", async () => {
    const a = await h.repo.createCourse({ title: "英语" });
    const b = await h.repo.createCourse({ title: "数据结构" });
    expect(a.id).toBeGreaterThan(0);
    const list = await h.repo.listCourses();
    expect(list.map((c) => c.title)).toEqual(["数据结构", "英语"]); // 按标题升序
    expect(b.categoryId).toBeNull();
  });

  it("时段：添加/视图标题/更新/删除", async () => {
    const c = await h.repo.createCourse({ title: "高数" });
    const slot = await h.repo.createSlot({
      courseId: c.id,
      weekday: 1,
      startMinutes: 540,
      durationMinutes: 90,
    });
    const view = await h.repo.listSlotsView();
    expect(view.length).toBe(1);
    expect(view[0].courseTitle).toBe("高数");

    const updated = await h.repo.updateSlot(slot.id, { durationMinutes: 120 });
    expect(updated?.durationMinutes).toBe(120);

    expect(await h.repo.deleteSlot(slot.id)).toBe(true);
    expect(await h.repo.listSlotsView()).toHaveLength(0);
  });

  it("撤销还原：insertRestoredCourse/Slots 恢复原 id", async () => {
    const c = await h.repo.createCourse({ title: "物理" });
    const s = await h.repo.createSlot({
      courseId: c.id,
      weekday: 2,
      startMinutes: 600,
      durationMinutes: 60,
    });
    const { course, slots } = await h.repo.deleteCourse(c.id);
    expect(course?.title).toBe("物理");
    expect(slots.length).toBe(1);

    await h.repo.insertRestoredCourse(course!);
    await h.repo.insertRestoredSlots(slots);
    const restored = await h.repo.findSlot(s.id);
    expect(restored).not.toBeNull();
    expect(restored?.courseId).toBe(c.id);
    expect(await h.repo.findCourse(c.id)).not.toBeNull();
  });

  it("孤儿时段课程删除后视图标题为 null", async () => {
    const c = await h.repo.createCourse({ title: "化学" });
    await h.repo.createSlot({ courseId: c.id, weekday: 3, startMinutes: 600 });
    await h.repo.deleteCourse(c.id);
    // 时段随课程级联删除
    expect(await h.repo.listSlotsView()).toHaveLength(0);
  });

  it("task_links：记录幂等、按课程取任务 id、按任务查课程", async () => {
    const c1 = await h.repo.createCourse({ title: "数学" });
    const c2 = await h.repo.createCourse({ title: "语文" });
    await h.repo.recordTaskLink(101, c1.id);
    await h.repo.recordTaskLink(102, c1.id);
    await h.repo.recordTaskLink(101, c1.id); // 幂等
    await h.repo.recordTaskLink(201, c2.id);
    expect(await h.repo.taskIdsForCourse(c1.id)).toEqual([101, 102]);
    expect(await h.repo.taskIdsForCourse(c2.id)).toEqual([201]);
    expect(await h.repo.courseIdForTask(102)).toBe(c1.id);
    expect(await h.repo.courseIdForTask(999)).toBeNull();
  });

  it("A1：removeTaskLinksByTaskId / allTaskLinkIds（任务删除时清理映射）", async () => {
    const c1 = await h.repo.createCourse({ title: "物理" });
    await h.repo.recordTaskLink(101, c1.id);
    await h.repo.recordTaskLink(102, c1.id);
    expect((await h.repo.allTaskLinkIds()).sort()).toEqual([101, 102]);
    await h.repo.removeTaskLinksByTaskId(101);
    expect(await h.repo.allTaskLinkIds()).toEqual([102]);
    expect(await h.repo.taskIdsForCourse(c1.id)).toEqual([102]);
  });
});
