import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { TaskRepository } from "../db/repositories/taskRepository";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { CategoryRepository } from "../db/repositories/categoryRepository";
import { AchievementProgressRepository } from "../db/repositories/achievementProgressRepository";
import { AchievementService, computeStreakDays } from "./achievementService";
import type { AchievementDefinition } from "../achievements/definitions";

function def(
  id: string,
  name: string,
  condition: AchievementDefinition["condition"],
  category = "basic",
  chainId: string | null = null,
  order = 0,
): AchievementDefinition {
  return {
    id,
    name,
    description: `${name} 描述`,
    icon: "Flag",
    category,
    condition,
    reward: null,
    hidden: false,
    enabled: true,
    chainId,
    order,
  };
}

describe("computeStreakDays", () => {
  it("连续 3 天 → 3", () => {
    const days = new Set(["2026-08-25", "2026-08-26", "2026-08-27"]);
    expect(computeStreakDays(days, new Date(2026, 7, 27, 12))).toBe(3);
  });

  it("中间缺一天 → 1", () => {
    const days = new Set(["2026-08-24", "2026-08-25", "2026-08-27"]); // 26 缺
    expect(computeStreakDays(days, new Date(2026, 7, 27, 12))).toBe(1);
  });

  it("今天无工作 → 0", () => {
    const days = new Set(["2026-08-25", "2026-08-26"]);
    expect(computeStreakDays(days, new Date(2026, 7, 27, 12))).toBe(0);
  });
});

describe("AchievementService", () => {
  let db: Db;
  let close: () => void;
  let tasks: TaskRepository;
  let sessions: FocusSessionRepository;
  let categories: CategoryRepository;
  let progress: AchievementProgressRepository;

  const firstPomodoro = def("first_pomodoro", "第一步", { type: "event_count", target: 1 });
  const tenPomodoros = def("ten", "十个", { type: "event_count", target: 10 });
  const dev120 = def("dev_120", "开发 2 小时", { type: "category_duration", categoryName: "开发", target: 120 }, "category");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 27, 12, 0, 0));

    const t = await createTestDb();
    db = t.db;
    close = t.close;
    tasks = new TaskRepository(db);
    sessions = new FocusSessionRepository(db);
    categories = new CategoryRepository(db);
    progress = new AchievementProgressRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    close();
  });

  async function makeSession(opts: {
    completed: boolean;
    actualDuration: number;
    categoryId?: number | null;
    startedAt?: number;
  }) {
    const task = await tasks.create({
      title: "T",
      scheduledDate: "2026-08-27",
      categoryId: opts.categoryId ?? null,
    });
    return sessions.create({
      taskId: task.id,
      categoryId: opts.categoryId ?? null,
      plannedDuration: opts.actualDuration,
      startedAt: opts.startedAt ?? Date.now(),
      actualDuration: opts.actualDuration,
      endedAt: Date.now(),
      completed: opts.completed,
    });
  }

  function makeService() {
    return new AchievementService([firstPomodoro, tenPomodoros, dev120], progress, sessions, categories, tasks);
  }

  it("1 个番茄 → first_pomodoro 解锁；9 个 → 10 次成就未解锁", async () => {
    await makeSession({ completed: true, actualDuration: 1500 });
    const newly = await makeService().evaluate();
    expect(newly.map((d) => d.id)).toContain("first_pomodoro");
    expect(newly.map((d) => d.id)).not.toContain("ten");

    // 补到 9 个（累计 9 个 completed）
    for (let i = 0; i < 8; i++) {
      await makeSession({ completed: true, actualDuration: 1500 });
    }
    const newly2 = await makeService().evaluate();
    expect(newly2.map((d) => d.id)).not.toContain("ten");
  });

  it("10 个番茄 → 解锁 10 次成就", async () => {
    for (let i = 0; i < 10; i++) {
      await makeSession({ completed: true, actualDuration: 1500 });
    }
    const newly = await makeService().evaluate();
    expect(newly.map((d) => d.id)).toContain("ten");
  });

  it("category_duration：119 分钟未解锁、120 分钟解锁", async () => {
    const dev = await categories.create("开发");
    await makeSession({ completed: true, actualDuration: 119 * 60, categoryId: dev.id });
    const newly = await makeService().evaluate();
    expect(newly.map((d) => d.id)).not.toContain("dev_120");

    await makeSession({ completed: true, actualDuration: 60, categoryId: dev.id }); // 累计 120 分钟
    const newly2 = await makeService().evaluate();
    expect(newly2.map((d) => d.id)).toContain("dev_120");
  });

  it("解锁幂等：重复 evaluate 不重复解锁", async () => {
    await makeSession({ completed: true, actualDuration: 1500 });
    await makeService().evaluate();
    const newly2 = await makeService().evaluate();
    expect(newly2).toHaveLength(0); // first_pomodoro 已解锁，不再返回
    const all = await progress.findAll();
    expect(all.filter((p) => p.unlocked)).toHaveLength(1);
  });

  it("解锁保存解锁时间，应用重启后仍保持", async () => {
    await makeSession({ completed: true, actualDuration: 1500 });
    await makeService().evaluate();
    const row = await progress.findById("first_pomodoro");
    expect(row?.unlocked).toBe(true);
    expect(row?.unlockedAt).not.toBeNull();
  });

  it("getProgressList 返回全部定义的进度与解锁态", async () => {
    await makeSession({ completed: true, actualDuration: 1500 });
    await makeService().evaluate();
    const list = await makeService().getProgressList();
    expect(list).toHaveLength(3);
    const first = list.find((x) => x.id === "first_pomodoro");
    expect(first?.unlocked).toBe(true);
    expect(first?.completed).toBe(true);
    const ten = list.find((x) => x.id === "ten");
    expect(ten?.unlocked).toBe(false);
    expect(ten?.current).toBe(1);
    expect(ten?.target).toBe(10);
  });

  describe("渐进式可见性（成就链）", () => {
    // 番茄数链：1 → 10 → 50（三个，未解锁则只显示第一个）
    const p1 = def("p1", "第一", { type: "event_count", target: 1 }, "basic", "pomodoro", 1);
    const p10 = def("p10", "第十", { type: "event_count", target: 10 }, "basic", "pomodoro", 2);
    const p50 = def("p50", "第五十", { type: "event_count", target: 50 }, "basic", "pomodoro", 3);
    // 独立成就（无链）
    const solo = def("solo", "独立", { type: "total_duration", target: 60 }, "basic");

    it("初始状态：每链只显示第一个，未来成就隐藏", async () => {
      const service = new AchievementService([p1, p10, p50, solo], progress, sessions, categories, tasks);
      const visible = await service.getVisibleAchievements();
      const ids = visible.map((v) => v.id);
      expect(ids).toContain("p1");
      expect(ids).toContain("solo");
      expect(ids).not.toContain("p10");
      expect(ids).not.toContain("p50");
    });

    it("完成第一个后：显示第二个，第三个仍隐藏", async () => {
      const service = new AchievementService([p1, p10, p50, solo], progress, sessions, categories, tasks);
      await makeSession({ completed: true, actualDuration: 1500 }); // 解锁 p1
      await service.evaluate();
      const visible = await service.getVisibleAchievements();
      const ids = visible.map((v) => v.id);
      expect(ids).toContain("p1");
      expect(ids).toContain("p10");
      expect(ids).not.toContain("p50");
    });

    it("多个链互不影响", async () => {
      // 番茄链 + 累计时长链 + 连续天数链，各自独立计算下一个
      const t1 = def("t1", "1h", { type: "total_duration", target: 60 }, "productivity", "total", 1);
      const t10 = def("t10", "10h", { type: "total_duration", target: 600 }, "productivity", "total", 2);
      const s3 = def("s3", "3天", { type: "streak_days", target: 3 }, "productivity", "streak", 1);
      const service = new AchievementService(
        [p1, p10, p50, t1, t10, s3],
        progress,
        sessions,
        categories,
        tasks,
      );
      const visible = await service.getVisibleAchievements();
      const ids = visible.map((v) => v.id);
      expect(ids).toContain("p1");
      expect(ids).toContain("t1");
      expect(ids).toContain("s3");
      expect(ids).not.toContain("p10");
      expect(ids).not.toContain("t10");
    });

    it("getUnlockedAchievements 只返回已解锁", async () => {
      const service = new AchievementService([p1, p10, p50, solo], progress, sessions, categories, tasks);
      await makeSession({ completed: true, actualDuration: 1500 });
      await service.evaluate();
      const unlocked = await service.getUnlockedAchievements();
      expect(unlocked.map((u) => u.id)).toEqual(["p1"]);
    });

    it("getCurrentAchievementByChain 返回链内当前下一个", async () => {
      const service = new AchievementService([p1, p10, p50], progress, sessions, categories, tasks);
      await makeSession({ completed: true, actualDuration: 1500 });
      await service.evaluate();
      const cur = await service.getCurrentAchievementByChain("pomodoro");
      expect(cur?.id).toBe("p10");
    });
  });

  describe("任务类成就（tasks_completed / daily / planned）", () => {
    const firstTask = def("first_task", "首个任务", { type: "tasks_completed", target: 1 }, "task");
    const daily3 = def("daily3", "单日 3 任务", { type: "daily_tasks_completed", target: 3 }, "task");
    const planned = def("planned1", "首次规划", { type: "planned_tasks", target: 1 }, "task");
    const plannedDone = def(
      "plannedDone1",
      "首个规划完成",
      { type: "planned_tasks_completed", target: 1 },
      "task",
    );

    function makeTaskService() {
      return new AchievementService(
        [firstTask, daily3, planned, plannedDone],
        progress,
        sessions,
        categories,
        tasks,
      );
    }

    it("完成 1 个任务 → tasks_completed 解锁；0 个不解锁", async () => {
      const t = await tasks.create({ title: "任务", scheduledDate: "2026-08-27" });
      expect((await makeTaskService().evaluate()).map((d) => d.id)).not.toContain("first_task");
      await tasks.update(t.id, { status: "COMPLETED", completedAt: Date.now() });
      const newly = await makeTaskService().evaluate();
      expect(newly.map((d) => d.id)).toContain("first_task");
    });

    it("单日完成 3 个任务 → daily_tasks_completed 解锁", async () => {
      for (let i = 0; i < 3; i++) {
        const t = await tasks.create({ title: `任务${i}`, scheduledDate: "2026-08-27" });
        await tasks.update(t.id, { status: "COMPLETED", completedAt: Date.now() });
      }
      const newly = await makeTaskService().evaluate();
      expect(newly.map((d) => d.id)).toContain("daily3");
    });

    it("跨天任务不计入单日峰值（同日 2 个 + 隔日 1 个不解锁 3）", async () => {
      const d1 = new Date(2026, 7, 27, 12).getTime();
      const d2 = new Date(2026, 7, 28, 12).getTime();
      for (let i = 0; i < 2; i++) {
        const t = await tasks.create({ title: `任务${i}`, scheduledDate: "2026-08-27" });
        await tasks.update(t.id, { status: "COMPLETED", completedAt: d1 });
      }
      const t = await tasks.create({ title: "任务x", scheduledDate: "2026-08-28" });
      await tasks.update(t.id, { status: "COMPLETED", completedAt: d2 });
      expect((await makeTaskService().evaluate()).map((d) => d.id)).not.toContain("daily3");
    });

    it("带计划时间的任务：首次规划与首次按计划完成", async () => {
      const t = await tasks.create({
        title: "规划任务",
        scheduledDate: "2026-08-27",
        plannedStart: 9 * 3_600_000,
        plannedEnd: 10 * 3_600_000,
      });
      const newly1 = await makeTaskService().evaluate();
      expect(newly1.map((d) => d.id)).toContain("planned1");
      expect(newly1.map((d) => d.id)).not.toContain("plannedDone1");

      await tasks.update(t.id, { status: "COMPLETED", completedAt: Date.now() });
      const newly2 = await makeTaskService().evaluate();
      expect(newly2.map((d) => d.id)).toContain("plannedDone1");
    });

    it("已取消任务不计入完成数", async () => {
      const t = await tasks.create({ title: "取消", scheduledDate: "2026-08-27" });
      await tasks.update(t.id, { status: "CANCELLED" });
      expect((await makeTaskService().evaluate()).map((d) => d.id)).not.toContain("first_task");
    });
  });
});
