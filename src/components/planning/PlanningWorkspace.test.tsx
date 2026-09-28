// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PlanningWorkspace from "./PlanningWorkspace";
import type { PlanningItem, PlanningWorkspaceService } from "../../services/planningWorkspaceService";
import { readFileSync } from "node:fs";
vi.mock("../../stores/appStore", () => ({ useAppStore: (select: (s: unknown) => unknown) => select({ dbStatus: "ready" }) }));
vi.mock("../../stores/settingsStore", () => ({ useSettingsStore: (select: (s: unknown) => unknown) => select({ settings: { longTermWeeklyCapacityMinutes: 1200 }, update: vi.fn() }) }));
afterEach(cleanup);
function fixture(overrides: Partial<PlanningItem> = {}): PlanningItem {
  return { key: "project:1", id: 1, kind: "project", title: "我的项目", description: "", lifecycle: "active", priority: "p2", archivedAt: null, sortOrder: 0,
    weeklyTargetMinutes: 360, targetDate: null, progress: null, progressLabel: "尚未建立成果进度", actualMinutes: 45, week: null, tasks: [], nextTask: null, nextAction: null, meta: null, plan: null, ...overrides };
}
function mockService(items: PlanningItem[] = []) {
  return { list: vi.fn().mockResolvedValue(items), create: vi.fn(), update: vi.fn().mockResolvedValue(undefined), scheduleNext: vi.fn().mockResolvedValue({ moved: true }),
    moveTasks: vi.fn().mockResolvedValue(1), rename: vi.fn(), addTask: vi.fn(), setWeek: vi.fn(),
    planning: { actualByItem: vi.fn().mockResolvedValue(new Map()), listWeeks: vi.fn().mockResolvedValue([]), listReviews: vi.fn().mockResolvedValue([]), saveReview: vi.fn().mockResolvedValue("r1"), history: vi.fn().mockResolvedValue([]) },
  } as unknown as PlanningWorkspaceService;
}
it("failed creation retains title, kind and idea selection for retry", async () => {
  const service = mockService(); vi.mocked(service.create).mockRejectedValue(new Error("保存失败"));
  render(<PlanningWorkspace service={service} />);
  fireEvent.click(screen.getByRole("button", { name: "新建事项" }));
  fireEvent.change(screen.getByLabelText("事项名称"), { target: { value: "保留我的想法" } });
  fireEvent.change(screen.getByLabelText("事项类型"), { target: { value: "project" } });
  fireEvent.click(screen.getByLabelText("先收进想法箱"));
  fireEvent.click(screen.getByRole("button", { name: "创建事项" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("事项名称") as HTMLInputElement).value).toBe("保留我的想法");
  expect(service.create).toHaveBeenCalledWith("project", "保留我的想法", true);
});
it("shows no weekly commitment instead of substituting the weekly default", async () => {
  render(<PlanningWorkspace service={mockService([fixture()])} />);
  await screen.findByText("我的项目");
  expect(screen.getByText("45 分钟 / 未承诺")).toBeTruthy();
  expect(screen.queryByText("45 分钟 / 6 小时")).toBeNull();
});
it("schedules the displayed task ID only after confirming an existing other date", async () => {
  const task = { id: 14, title: "写第一章", scheduledDate: "2099-01-01", status: "PENDING" } as PlanningItem["tasks"][number];
  const service = mockService([fixture({ tasks: [task], nextTask: task, nextAction: task.title })]);
  render(<PlanningWorkspace service={service} />);
  fireEvent.click(await screen.findByText("我的项目"));
  fireEvent.click(screen.getByRole("button", { name: "加入今天" }));
  expect(service.scheduleNext).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").textContent).toContain("2099-01-01");
  fireEvent.click(screen.getByRole("button", { name: "确认改期" }));
  await waitFor(() => expect(service.scheduleNext).toHaveBeenCalledWith("project:1", expect.any(String), 14));
});
it("reading and editing a review never saves until explicit confirmation", async () => {
  const service = mockService([fixture()]);
  render(<PlanningWorkspace service={service} />);
  await screen.findByText("我的项目");
  fireEvent.click(screen.getByRole("tab", { name: "复盘" }));
  fireEvent.change(await screen.findByLabelText("复盘笔记（可选）"), { target: { value: "下周专注一个成果" } });
  expect(service.planning.saveReview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认并保存复盘" }));
  await waitFor(() => expect(service.planning.saveReview).toHaveBeenCalledWith(expect.objectContaining({ note: "下周专注一个成果" })));
});
it("moves only checked tasks after a preview and keeps the other task untouched", async () => {
  const tasks = [{ id: 14, title: "检查第一章", scheduledDate: "2099-01-01", status: "PENDING" }, { id: 15, title: "保留第二章", scheduledDate: "2099-01-02", status: "PENDING" }] as PlanningItem["tasks"];
  const service = mockService([fixture({ tasks })]);
  render(<PlanningWorkspace service={service} />);
  fireEvent.click(await screen.findByText("我的项目")); fireEvent.click(screen.getByRole("tab", { name: "任务" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /检查第一章/ }));
  fireEvent.change(screen.getByLabelText("所选任务移动到"), { target: { value: "2099-02-01" } });
  fireEvent.click(screen.getByRole("button", { name: "预览改期（1）" }));
  expect(service.moveTasks).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog").textContent).toContain("2099-01-01 → 2099-02-01");
  expect(screen.getByRole("dialog").textContent).not.toContain("保留第二章");
  fireEvent.click(screen.getByRole("button", { name: "确认移动所选任务" }));
  await waitFor(() => expect(service.moveTasks).toHaveBeenCalledWith("project:1", [14], "2099-02-01"));
});
it("historical review keeps missing commitments unknown even with a weekly default", async () => {
  const service = mockService([fixture()]); vi.mocked(service.planning.actualByItem).mockResolvedValue(new Map([["project:1", 75]]));
  render(<PlanningWorkspace service={service} />);
  await screen.findByText("我的项目"); fireEvent.click(screen.getByRole("tab", { name: "复盘" }));
  await screen.findByText("1 小时 15 分钟");
  fireEvent.click(screen.getByRole("button", { name: "确认并保存复盘" }));
  await waitFor(() => expect(service.planning.saveReview).toHaveBeenCalledWith(expect.objectContaining({ snapshot: [expect.objectContaining({ plannedMinutes: null, originalMinutes: null, actualMinutes: 75 })] })));
});
it("all-items view can reveal archived and completed records", async () => {
  render(<PlanningWorkspace service={mockService([fixture({ lifecycle: "completed", archivedAt: 1, title: "归档成果" })])} />);
  await screen.findByText("给长期方向一个位置");
  expect(screen.queryByText("归档成果")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "全部事项" }));
  expect(await screen.findByText("归档成果")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("状态筛选"), { target: { value: "archived" } });
  expect(screen.getByText("归档成果")).toBeTruthy();
});
it("narrow detail uses document flow without a fixed-height nested scrolling pane", () => {
  const css = readFileSync(`${process.cwd()}/src/components/planning/planning.css`, "utf8");
  expect(css).toContain(".pw-has-detail .pw-list { display:none; }");
  expect(css).not.toMatch(/\.pw-detail\s*\{[^}]*(?:height|overflow):/);
  expect(css).not.toMatch(/overflow(?:-y)?:\s*(?:auto|scroll)/);
});
