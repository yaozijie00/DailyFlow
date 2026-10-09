// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PlanningGantt from "./PlanningGantt";
import type { PlanningItem } from "../../services/planningWorkspaceService";
import type { Task } from "../../db/repositories/taskRepository";
import { addDays } from "../../lib/planningDates";
import { todayString } from "../../lib/date";

const data = vi.hoisted(() => ({ ranges: [] as { taskId:number;startDay:string;endDay:string;updatedAt:number }[] }));
vi.mock("../../db/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/dataVersion", () => ({ useDataVersion: () => 0 }));
vi.mock("../tasks/TaskDetail", () => ({ default: () => null }));
vi.mock("../../services/ganttService", () => ({ GanttService: class {
  async ranges() { return data.ranges; }
  async milestones() { return []; }
  async phases() { return [{ id:1,goalId:1,title:"准备阶段",progressPercent:0 },{ id:2,goalId:1,title:"交付阶段",progressPercent:0 }]; }
} }));
afterEach(cleanup);

function task(id:number,title:string,parentId:number|null,phaseId:number|null):Task {
  return { id,title,parentId,phaseId,status:"TODO",categoryId:null,estimatedDuration:null,plannedStart:null,plannedEnd:null,actualDuration:0,scheduledDate:"",createdAt:1,updatedAt:1,completedAt:null,notes:null,sortOrder:0,goalId:1,projectId:null,courseId:null,priority:"medium",repeatRule:"" };
}
function fixture():PlanningItem {
  return { key:"plan:1",id:1,kind:"plan",title:"作品计划",description:"",lifecycle:"active",priority:"p2",archivedAt:null,sortOrder:0,weeklyTargetMinutes:0,targetDate:null,progress:0,progressLabel:"",actualMinutes:0,week:null,nextTask:null,nextAction:null,meta:null,plan:null,
    tasks:[task(1,"父任务",null,1),task(2,"中间任务",1,2),task(3,"实际执行",2,null)] };
}
it("summarizes deep execution dates and keeps mixed-phase descendants in one tree", async () => {
  const start=addDays(todayString(),1),end=addDays(start,2);
  data.ranges=[{ taskId:1,startDay:"2020-01-01",endDay:"2020-01-02",updatedAt:1 },{ taskId:3,startDay:start,endDay:end,updatedAt:1 }];
  const item=fixture(); item.tasks[2].status="COMPLETED";
  render(<PlanningGantt items={[item]} />);
  expect(await screen.findByRole("button",{ name:`准备阶段 ${start} 至 ${end}` })).toBeTruthy();
  expect(screen.getByRole("button",{ name:`父任务 ${start} 至 ${end}` })).toBeTruthy();
  expect(screen.getByRole("button",{ name:`中间任务 ${start} 至 ${end}` })).toBeTruthy();
  expect(screen.getAllByRole("button",{ name:"实际执行" })).toHaveLength(1);
  expect(screen.queryByRole("button",{ name:new RegExp(`交付阶段 ${start}`) })).toBeNull();
  expect(screen.getByRole("button",{ name:"准备阶段" }).parentElement?.textContent).toContain("100%");
});
it("collapsing a phase hides its whole tree even when descendants have another phase", async () => {
  data.ranges=[];
  render(<PlanningGantt items={[fixture()]} />);
  fireEvent.click(await screen.findByRole("button",{ name:"收起准备阶段" }));
  expect(screen.queryByRole("button",{ name:"实际执行" })).toBeNull();
  expect(screen.queryByRole("button",{ name:"中间任务" })).toBeNull();
  fireEvent.click(screen.getByRole("button",{ name:"展开准备阶段" }));
  expect(screen.getAllByRole("button",{ name:"实际执行" })).toHaveLength(1);
});
