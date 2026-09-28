// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Goals from "./Goals";
const state = vi.hoisted(() => ({ selectedPlanId: null as number | null, phases: [], loadingDetail: false, selectPlan: vi.fn(), loadDetail: vi.fn() }));
const list = vi.hoisted(() => vi.fn());
vi.mock("../components/planning/PlanningWorkspace", () => ({ default: ({ onOpenPlan }: { onOpenPlan: (id: number) => void }) => <button onClick={() => onOpenPlan(7)}>工作台阶段入口</button>, planningWorkspaceService: { list } }));
vi.mock("../stores/longTermPlanStore", () => ({ useLongTermPlanStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) }));
vi.mock("../stores/goalStore", () => ({ useGoalStore: { getState: () => ({ update: vi.fn() }) } }));
vi.mock("../components/goals/LongTermPlanDetail", () => ({ PhasePlan: ({ plan }: { plan: { title: string } }) => <p>{plan.title}阶段编辑</p> }));
afterEach(cleanup);
beforeEach(() => { state.selectedPlanId = null; vi.clearAllMocks(); list.mockResolvedValue([]); });
it("工作台入口连接原有阶段选择", () => {
  render(<Goals />); fireEvent.click(screen.getByRole("button", { name: "工作台阶段入口" })); expect(state.selectPlan).toHaveBeenCalledWith(7);
});
it("已完成计划仍能进入阶段回看并返回", async () => {
  state.selectedPlanId = 7; list.mockResolvedValue([{ id: 7, kind: "plan", plan: { title: "已完成计划", status: "completed" } }]);
  render(<Goals />); await screen.findByText("已完成计划阶段编辑");
  fireEvent.click(screen.getByRole("button", { name: "返回长期工作台" })); expect(state.selectPlan).toHaveBeenCalledWith(null);
});
it("计划加载失败提供返回路径", async () => {
  state.selectedPlanId = 7; list.mockRejectedValue(new Error("连接失败"));
  render(<Goals />); expect((await screen.findByRole("alert")).textContent).toContain("加载失败"); expect(screen.getByRole("button", { name: "返回长期工作台" })).toBeTruthy();
});
