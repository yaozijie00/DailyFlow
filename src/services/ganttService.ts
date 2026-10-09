import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/db";
import { goals, projects, tasks } from "../db/schema";
import { taskPlanningRanges, planningMilestones } from "../db/ganttSchema";
import { LongTermPlanRepository } from "../db/repositories/longTermPlanRepository";
import { parsePlanningKey } from "../db/repositories/planningRepository";
import { isLocalDate } from "./taskSchedulingService";
import { UndoManager, undoManager } from "../lib/undoManager";
import { bumpDataVersion } from "../lib/dataVersion";

export type TaskRange = typeof taskPlanningRanges.$inferSelect;
export type Milestone = typeof planningMilestones.$inferSelect;
export class GanttService {
  constructor(private readonly db: Db, private readonly history: UndoManager = undoManager) {}
  private changed() { bumpDataVersion("task"); bumpDataVersion("goal"); bumpDataVersion("project"); }
  async ranges() { return this.db.select().from(taskPlanningRanges).all(); }
  async range(taskId: number) { return (await this.db.select().from(taskPlanningRanges).where(eq(taskPlanningRanges.taskId, taskId)).get()) ?? null; }
  async phases(goalId: number) { return new LongTermPlanRepository(this.db).listPhases(goalId); }
  async setRange(taskId: number, startDay: string, endDay: string, expected?: TaskRange | null) {
    if ((startDay || endDay) && (!isLocalDate(startDay) || !isLocalDate(endDay) || endDay < startDay)) throw new Error("请填写有效的开始、结束日期，结束不能早于开始");
    if (!await this.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).get()) throw new Error("任务已不存在");
    const before = await this.range(taskId);
    if (expected !== undefined && JSON.stringify(before) !== JSON.stringify(expected)) throw new Error("日期已在其他位置修改，请重新打开日期编辑");
    const after = startDay ? { taskId, startDay, endDay, updatedAt: Math.max(Date.now(),(before?.updatedAt ?? 0)+1) } : null;
    let current = before;
    const apply = async (value: TaskRange | null) => {
      if (value) {
        const stamp = Math.max(Date.now(),(current?.updatedAt ?? 0)+1);
        const result = current ? await this.db.values(sql`UPDATE task_planning_ranges SET start_day=${value.startDay},end_day=${value.endDay},updated_at=${stamp} WHERE task_id=${taskId} AND updated_at=${current.updatedAt} RETURNING task_id`)
          : await this.db.values(sql`INSERT INTO task_planning_ranges(task_id,start_day,end_day,updated_at) VALUES(${taskId},${value.startDay},${value.endDay},${stamp}) ON CONFLICT(task_id) DO NOTHING RETURNING task_id`);
        if (!result.length) throw new Error("日期已变化，请重新打开日期编辑；未覆盖现有范围");
        current = { ...value,updatedAt:stamp };
      } else if (current) {
        const result = await this.db.values(sql`DELETE FROM task_planning_ranges WHERE task_id=${taskId} AND updated_at=${current.updatedAt} RETURNING task_id`);
        if (!result.length) throw new Error("日期已变化，未覆盖现有范围");
        current = null;
      }
      this.changed();
    };
    await apply(after);
    if (!this.history.applying) this.history.push({ type: "gantt.range", label: "调整长期计划日期", undo: () => apply(before), redo: () => apply(after) });
  }
  async milestones() { return this.db.select().from(planningMilestones).orderBy(planningMilestones.targetDay, planningMilestones.id).all(); }
  async createMilestone(itemKey: string, title: string, targetDay: string) {
    const ref = parsePlanningKey(itemKey);
    if (!title.trim() || !isLocalDate(targetDay)) throw new Error("请填写节点名称和有效日期");
    const exists = ref.kind === "plan" ? await this.db.select({ id: goals.id }).from(goals).where(eq(goals.id, ref.id)).get() : await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, ref.id)).get();
    if (!exists) throw new Error("所属事项已不存在");
    const [created] = await this.db.insert(planningMilestones).values({ goalId: ref.kind === "plan" ? ref.id : null, projectId: ref.kind === "project" ? ref.id : null, title: title.trim(), targetDay, updatedAt: Date.now() }).returning().all();
    this.changed();
    if (!this.history.applying) this.history.push({ type: "gantt.milestone", label: "添加里程碑", undo: async () => { await this.db.delete(planningMilestones).where(eq(planningMilestones.id, created.id)).run(); this.changed(); }, redo: async () => { await this.db.insert(planningMilestones).values(created).run(); this.changed(); } });
    return created;
  }
  async updateMilestone(id: number, completed: boolean) {
    const before = await this.db.select().from(planningMilestones).where(eq(planningMilestones.id, id)).get();
    if (!before) throw new Error("里程碑已不存在");
    let current=before.updatedAt;
    const apply = async (value: boolean) => {
      const stamp=Math.max(Date.now(),current+1);
      const result=await this.db.values(sql`UPDATE planning_milestones SET completed=${value ? 1 : 0},updated_at=${stamp} WHERE id=${id} AND updated_at=${current} RETURNING id`);
      if (!result.length) throw new Error("里程碑已变化，未覆盖现有内容");
      current=stamp; this.changed();
    };
    await apply(completed);
    if (!this.history.applying) this.history.push({ type: "gantt.milestoneStatus", label: "更新里程碑", undo: () => apply(before.completed), redo: () => apply(completed) });
  }
  async editMilestone(id:number,title:string,targetDay:string,expectedVersion:number) {
    if (!title.trim() || !isLocalDate(targetDay)) throw new Error("请填写节点名称和有效日期");
    const before=await this.db.select().from(planningMilestones).where(eq(planningMilestones.id,id)).get();
    if (!before || before.updatedAt!==expectedVersion) throw new Error("节点已变化，请重新打开编辑");
    let current=before.updatedAt;
    const apply=async (value:{ title:string;targetDay:string }) => {
      const stamp=Math.max(Date.now(),current+1);
      const result=await this.db.values(sql`UPDATE planning_milestones SET title=${value.title},target_day=${value.targetDay},updated_at=${stamp} WHERE id=${id} AND updated_at=${current} RETURNING id`);
      if (!result.length) throw new Error("节点已变化，未覆盖现有内容");
      current=stamp; this.changed();
    };
    const after={ title:title.trim(),targetDay }; await apply(after);
    if (!this.history.applying) this.history.push({ type:"gantt.editMilestone",label:"编辑里程碑",undo:()=>apply(before),redo:()=>apply(after) });
  }
  async deleteMilestone(id: number) {
    const before = await this.db.select().from(planningMilestones).where(eq(planningMilestones.id, id)).get();
    if (!before) return;
    await this.db.delete(planningMilestones).where(eq(planningMilestones.id, id)).run(); this.changed();
    if (!this.history.applying) this.history.push({ type: "gantt.deleteMilestone", label: "删除里程碑", undo: async () => { await this.db.insert(planningMilestones).values(before).run(); this.changed(); }, redo: async () => { await this.db.delete(planningMilestones).where(eq(planningMilestones.id, id)).run(); this.changed(); } });
  }
}
