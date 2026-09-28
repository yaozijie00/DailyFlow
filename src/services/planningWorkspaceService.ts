import { eq, isNotNull, or } from "drizzle-orm";
import type { Db } from "../db/db";
import { goals, projects, tasks } from "../db/schema";
import { planningMeta, planningWeeks } from "../db/planningSchema";
import { and } from "drizzle-orm";
import { GoalRepository, type GoalWithProgress } from "../db/repositories/goalRepository";
import { ProjectRepository } from "../db/repositories/projectRepository";
import { TaskRepository, type Task } from "../db/repositories/taskRepository";
import { PlanningRepository, parsePlanningKey, type Lifecycle, type MetaPatch, type PlanningMeta, type PlanningWeek } from "../db/repositories/planningRepository";
import { undoManager, type UndoManager } from "../lib/undoManager";
import { bumpDataVersion } from "../lib/dataVersion";
import { normalizeLongTermPriority, progressFromEstimatedMinutes } from "../lib/longTermPlan";
import { addDays, weekOf } from "../lib/planningDates";
import { TaskSchedulingService, isLocalDate } from "./taskSchedulingService";
import { planningHealth, readPlanningActivity, type PlanningHealthReason } from "./planningHealth";

export interface PlanningItem {
  key: string; id: number; kind: "plan" | "project"; title: string; description: string;
  lifecycle: Lifecycle; priority: string; archivedAt: number | null; sortOrder: number;
  weeklyTargetMinutes: number; targetDate: string | null; progress: number | null; progressLabel: string;
  actualMinutes: number; week: PlanningWeek | null; tasks: Task[]; nextTask: Task | null;
  nextAction: string | null; meta: PlanningMeta | null; plan: GoalWithProgress | null;
  health?: PlanningHealthReason[];
}

/** A shared read model, retaining existing Plan/Project/Task IDs. */
export class PlanningWorkspaceService {
  readonly planning: PlanningRepository;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: Db, private readonly history: UndoManager = undoManager) {
    this.planning = new PlanningRepository(db);
  }
  private changed() { bumpDataVersion("goal"); bumpDataVersion("project"); }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.chain.then(work, work);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }
  async list(week: string): Promise<PlanningItem[]> {
    const now = Date.now();
    const [plans, projectRows, metaRows, weeks, actual, taskRows, activity] = await Promise.all([
      new GoalRepository(this.db).findAllWithProgress(), new ProjectRepository(this.db).findAllWithGoal(),
      this.planning.listMeta(), this.planning.listWeeks(week), this.planning.actualByItem(week, addDays(week, 7)),
      this.db.select().from(tasks).where(or(isNotNull(tasks.goalId), isNotNull(tasks.projectId))).orderBy(tasks.sortOrder, tasks.id).all(),
      readPlanningActivity(this.db, now),
    ]);
    const metadata = new Map(metaRows.map((row) => [row.key, row]));
    const commitments = new Map(weeks.map((row) => [row.itemKey, row]));
    const taskGroups = new Map<string, Task[]>();
    for (const task of taskRows) {
      const key = task.projectId != null ? `project:${task.projectId}` : `plan:${task.goalId}`;
      const group = taskGroups.get(key) ?? []; group.push(task); taskGroups.set(key, group);
    }
    const createItem = (kind: "plan" | "project", source: { id: number; title: string; sortOrder: number; createdAt: number }, plan: GoalWithProgress | null): PlanningItem => {
      const key = `${kind}:${source.id}`, meta = metadata.get(key) ?? null;
      const allTasks = taskGroups.get(key) ?? [];
      const active = allTasks.filter((task) => task.status !== "CANCELLED");
      const parents = new Set(active.flatMap((task) => task.parentId == null ? [] : [task.parentId]));
      const leaves = active.filter((task) => !parents.has(task.id));
      const pending = leaves.filter((task) => task.status !== "COMPLETED");
      const text = plan?.nextAction?.trim() || null;
      const nextTask = pending.find((task) => task.id === meta?.nextTaskId)
        ?? (text ? pending.find((task) => task.title.trim() === text) : undefined)
        ?? (text ? null : pending.find((task) => task.phaseId === plan?.currentPhaseId) ?? pending[0] ?? null);
      const manual = kind === "plan" ? (plan?.progressMode === "manual" ? plan.manualProgress : null) : meta?.manualProgress;
      const complete = leaves.filter((task) => task.status === "COMPLETED").length;
      const estimated = plan?.progressMode !== "tasks" && leaves.length > 0 && leaves.every((task) => (task.estimatedDuration ?? 0) > 0);
      const progress = manual ?? (leaves.length ? estimated ? progressFromEstimatedMinutes(leaves.map((task) => ({ status: task.status, estimatedMinutes: (task.estimatedDuration ?? 0) / 60 }))) : Math.min(complete === leaves.length ? 100 : 99, Math.round(100 * complete / leaves.length)) : null);
      const item: PlanningItem = { key, id: source.id, kind, title: source.title, description: plan?.description ?? meta?.description ?? "",
        lifecycle: (meta?.lifecycle ?? plan?.status ?? "not_started") as Lifecycle,
        priority: normalizeLongTermPriority(plan?.priority ?? meta?.priority),
        archivedAt: meta?.archivedAt ?? (plan?.status === "archived" ? plan.updatedAt : null), sortOrder: meta?.sortOrder ?? source.sortOrder,
        weeklyTargetMinutes: plan?.weeklyTargetMinutes ?? meta?.weeklyTargetMinutes ?? 0,
        targetDate: plan?.deadline ?? meta?.targetDate ?? null, progress,
        progressLabel: manual != null ? `约 ${manual}% · 手动` : leaves.length ? estimated ? `约 ${progress}% · 估时加权` : `${complete} / ${leaves.length} 项 · 按任务` : "尚未建立成果进度",
        actualMinutes: Math.round(actual.get(key) ?? 0), week: commitments.get(key) ?? null,
        tasks: allTasks, nextTask, nextAction: nextTask?.title ?? text, meta, plan };
      item.health = planningHealth({ ...item, createdAt: source.createdAt, lastActivityAt: activity.get(key) ?? null }, now);
      return item;
    };
    return [...plans.map((plan) => createItem("plan", plan, plan)), ...projectRows.map((project) => createItem("project", project, null))]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.kind.localeCompare(b.kind) || a.id - b.id);
  }
  async create(kind: "plan" | "project", title: string, idea = false): Promise<string> {
    const value = title.trim(); if (!value) throw new Error("请填写事项名称");
    const source = kind === "plan" ? await new GoalRepository(this.db).create({ title: value, status: "not_started", weeklyTargetMinutes: 0 })
      : await new ProjectRepository(this.db).create({ title: value });
    const key = `${kind}:${source.id}`;
    const repo = kind === "plan" ? new GoalRepository(this.db) : new ProjectRepository(this.db);
    try { await this.planning.updateMeta(key, { lifecycle: idea ? "idea" : "not_started" }); }
    catch (error) { await repo.delete(source.id); throw error; }
    if (!this.history.applying) {
      const goalRepo = new GoalRepository(this.db), projectRepo = new ProjectRepository(this.db);
      const goal = kind === "plan" ? await goalRepo.findById(source.id) : null;
      const project = kind === "project" ? await projectRepo.findById(source.id) : null;
      const children = goal ? await goalRepo.snapshotChildren(source.id) : null;
      const planning = project ? await projectRepo.snapshotPlanning(source.id) : null;
      this.history.push({ type: "planning.create", label: "创建长期事项", undo: async () => { await repo.delete(source.id); this.changed(); }, redo: async () => {
        if (goal && children) { await goalRepo.insertRestored(goal); await goalRepo.restoreChildren(children); }
        if (project && planning) { await projectRepo.insertRestored(project); await projectRepo.restorePlanning(planning); }
        this.changed();
      } });
    }
    this.changed(); return key;
  }
  async update(key: string, patch: MetaPatch): Promise<void> {
    return this.serial(async () => {
      const before = await this.planning.ensureMeta(key);
      const oldText = before.goalId != null && patch.nextTaskId !== undefined ? (await new GoalRepository(this.db).findById(before.goalId))?.nextAction ?? null : null;
      const after = await this.planning.updateMeta(key, patch);
      if (!this.history.applying) {
        const restore: MetaPatch = {};
        for (const field of Object.keys(patch) as Array<keyof MetaPatch>) Object.assign(restore, { [field]: before[field] });
        this.history.push({ type: "planning.update", label: "调整长期事项", undo: async () => {
          await this.planning.updateMeta(key, restore);
          if (before.goalId != null && oldText != null) await new GoalRepository(this.db).update(before.goalId, { nextAction: oldText });
          this.changed();
        }, redo: async () => { await this.planning.updateMeta(key, patch); this.changed(); } });
      }
      void after; this.changed();
    });
  }
  async setWeek(key: string, week: string, minutes: number, reason = "", intention?: string): Promise<void> {
    return this.serial(async () => {
      const before = await this.planning.getWeek(key, week);
      await this.planning.setWeek(key, week, minutes, reason, intention);
      if (!this.history.applying) this.history.push({ type: "planning.week", label: "调整本周承诺", undo: async () => {
        if (before) await this.planning.setWeek(key, week, before.targetMinutes, "撤销调整", before.intention);
        else await this.db.delete(planningWeeks).where(and(eq(planningWeeks.itemKey, key), eq(planningWeeks.weekStart, week))).run();
        this.changed();
      }, redo: async () => { await this.planning.setWeek(key, week, minutes, reason, intention); this.changed(); } });
      this.changed();
    });
  }
  async addTask(key: string, title: string, estimatedMinutes?: number): Promise<Task> {
    const ref = parsePlanningKey(key); const before = await this.planning.ensureMeta(key);
    const oldText = before.goalId != null ? (await new GoalRepository(this.db).findById(before.goalId))?.nextAction ?? null : null;
    if (!title.trim()) throw new Error("请填写下一步动作");
    if (estimatedMinutes != null && (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 0)) throw new Error("预计时间无效");
    const project = ref.kind === "project" ? await new ProjectRepository(this.db).findById(ref.id) : null;
    // Empty date is the existing string-schema representation of an unscheduled task.
    const task = await new TaskRepository(this.db).create({ title: title.trim(), scheduledDate: "", goalId: ref.kind === "plan" ? ref.id : project?.goalId,
      projectId: ref.kind === "project" ? ref.id : null, estimatedDuration: estimatedMinutes != null ? estimatedMinutes * 60 : null });
    const repo = new TaskRepository(this.db);
    try { await this.planning.updateMeta(key, { nextTaskId: task.id }); }
    catch (error) { await repo.delete(task.id); throw error; }
    if (!this.history.applying) this.history.push({ type: "planning.task", label: "添加下一步", undo: async () => {
      await repo.delete(task.id);
      await this.db.update(planningMeta).set({ nextTaskId: before.nextTaskId }).where(eq(planningMeta.key, key)).run();
      if (before.goalId != null && oldText != null) await new GoalRepository(this.db).update(before.goalId, { nextAction: oldText });
      bumpDataVersion("task"); this.changed();
    }, redo: async () => { await repo.insertRestored(task); await this.planning.updateMeta(key, { nextTaskId: task.id }); bumpDataVersion("task"); this.changed(); } });
    bumpDataVersion("task"); this.changed(); return task;
  }
  async scheduleNext(key: string, date: string, expectedTaskId?: number): Promise<{ task: Task; moved: boolean }> {
    if (!isLocalDate(date)) throw new Error("请选择有效的排期日期");
    return this.serial(async () => {
      const item = (await this.list(weekOf())).find((row) => row.key === key);
      if (!item) throw new Error("长期事项已不存在");
      let task = expectedTaskId == null ? item.nextTask : item.tasks.find((entry) => entry.id === expectedTaskId) ?? null;
      if (expectedTaskId != null && (!task || ["COMPLETED", "CANCELLED"].includes(task.status))) throw new Error("显示的任务已变化，请刷新下一步后重试");
      if (!task) {
        if (!item.nextAction) throw new Error("请先添加下一步行动");
        task = await this.addTask(key, item.nextAction);
      }
      await this.planning.updateMeta(key, { nextTaskId: task.id });
      const moved = await new TaskSchedulingService(this.db, this.history).move([task.id], date);
      this.changed(); return { task: (await new TaskRepository(this.db).findById(task.id))!, moved: moved > 0 };
    });
  }
  async moveTasks(key: string, ids: number[], date: string): Promise<number> {
    const item = (await this.list(weekOf())).find((row) => row.key === key);
    if (!item || ids.some((id) => !item.tasks.some((task) => task.id === id))) throw new Error("所选任务不属于当前事项");
    const count = await new TaskSchedulingService(this.db, this.history).move(ids, date); this.changed(); return count;
  }
  async rename(key: string, title: string): Promise<void> {
    const ref = parsePlanningKey(key), value = title.trim(); if (!value) throw new Error("名称不能为空");
    const table = ref.kind === "plan" ? goals : projects;
    const before = await this.db.select({ title: table.title }).from(table).where(eq(table.id, ref.id)).get();
    if (!before) throw new Error("事项已不存在");
    if (before.title === value) return;
    const write = async (title: string) => { await this.db.update(table).set({ title, updatedAt: Date.now() }).where(eq(table.id, ref.id)).run(); this.changed(); };
    await write(value);
    if (!this.history.applying) this.history.push({ type: "planning.rename", label: "修改事项名称", undo: () => write(before.title), redo: () => write(value) });
  }
}
