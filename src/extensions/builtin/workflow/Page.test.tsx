// @vitest-environment jsdom
/**
 * WorkflowPage 测试：
 * 1. hooks 顺序回归（列表 → 编辑器早退不报 fewer hooks）；
 * 2. Phase 6「按任务运行」：经 ctx.tasks.listByDate 列出今日任务 → 选中 → runnerHost.start(wfId, taskId)。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import WorkflowPage from "./Page";

afterEach(cleanup);

const workflowMock = vi.hoisted(() => ({
  list: [{ id: "w1", name: "石材材质流程", description: "", tags: [] }],
  current: null,
  loadList: vi.fn(async () => undefined),
  load: vi.fn(async () => undefined),
  create: vi.fn(async () => "w1"),
  remove: vi.fn(async () => undefined),
  duplicate: vi.fn(async () => undefined),
  updateMeta: vi.fn(async () => undefined),
}));

vi.mock("./store/workflowStore", () => ({
  useWorkflowStore: (selector: (s: unknown) => unknown) => selector(workflowMock),
}));

const preferenceMock = vi.hoisted(() => ({ openEditorAfterCreate: true }));
vi.mock("./preferences", () => ({
  getWorkflowPreferences: () => ({
    openEditorAfterCreate: preferenceMock.openEditorAfterCreate,
  }),
}));

const appMock = vi.hoisted(() => ({ pushToast: vi.fn() }));
vi.mock("../../../stores/appStore", () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(appMock),
}));

// Phase 6：mock 宿主 Context 的 listByDate（今日任务只读查询）
const hostCtxMock = vi.hoisted(() => ({
  getHostContext: vi.fn(() => ({
    apiVersion: 1,
    tasks: {
      listByDate: vi.fn(async () => [
        { id: 101, title: "制作石材材质", status: "TODO" },
        { id: 102, title: "已完成的事", status: "COMPLETED" },
      ]),
      complete: vi.fn(async () => true),
    },
  })),
}));
vi.mock("../../registry", () => hostCtxMock);

vi.mock("../../../lib/date", () => ({
  todayString: () => "2026-01-01",
}));

// mock runnerHost：断言 start 收到 taskId
const runnerHostMock = vi.hoisted(() => ({
  start: vi.fn(async (_wfId: string, taskId?: number | null) => ({
    run: { id: "r1", state: "paused", error: null },
    events: [],
    taskId: taskId ?? null,
  })),
  resume: vi.fn(async () => ({ run: { id: "r1", state: "completed" }, events: [] })),
  confirmFinish: vi.fn(async () => ({ run: { id: "r1", state: "completed" }, events: [] })),
  cancel: vi.fn(async () => ({ id: "r1", state: "cancelled" })),
}));
vi.mock("./runnerHost", () => ({
  workflowRunnerHost: runnerHostMock,
}));

describe("WorkflowPage", () => {
  it("hooks 顺序回归：列表 → 编辑器（current 未加载早退）不触发 hooks 数量错误", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      render(<WorkflowPage />);
      expect(screen.getByText("石材材质流程")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "编辑 石材材质流程" }));
      expect(screen.getByText("加载中…")).toBeTruthy();
      expect(screen.getByRole("button", { name: "返回列表" })).toBeTruthy();
      const hookError = errorSpy.mock.calls.some((c) =>
        c.some((a) => typeof a === "string" && a.includes("fewer hooks")),
      );
      expect(hookError).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("Phase 6：按任务运行 → 只列今日待办 → 选中后 start 携带 taskId", async () => {
    render(<WorkflowPage />);
    fireEvent.click(screen.getByRole("button", { name: "按任务运行 石材材质流程" }));

    // 列表只含 TODO（已完成的不出现）
    await waitFor(() => expect(screen.getByText("制作石材材质")).toBeTruthy());
    expect(screen.queryByText("已完成的事")).toBeNull();

    // 选中任务 → start(wfId, taskId)
    fireEvent.click(screen.getByText("制作石材材质"));
    await waitFor(() => expect(runnerHostMock.start).toHaveBeenCalledTimes(1));
    expect(runnerHostMock.start).toHaveBeenCalledWith("w1", 101);
  });

  it("Phase 6：宿主无 listByDate 时给出可读提示且不崩溃", async () => {
    hostCtxMock.getHostContext.mockReturnValueOnce({
      apiVersion: 1,
      tasks: {},
    } as unknown as ReturnType<typeof hostCtxMock.getHostContext>);
    render(<WorkflowPage />);
    fireEvent.click(screen.getByRole("button", { name: "按任务运行 石材材质流程" }));
    await waitFor(() => expect(appMock.pushToast).toHaveBeenCalledWith("error", expect.stringContaining("任务联动不可用")));
  });

  it("关闭自动打开偏好后，创建成功停留在列表", async () => {
    preferenceMock.openEditorAfterCreate = false;
    workflowMock.load.mockClear();
    workflowMock.create.mockClear();
    render(<WorkflowPage />);
    fireEvent.click(screen.getByRole("button", { name: "新建" }));
    fireEvent.change(screen.getByPlaceholderText("流程名称"), {
      target: { value: "连续创建测试" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(workflowMock.create).toHaveBeenCalled());
    expect(workflowMock.load).not.toHaveBeenCalled();
    expect(screen.getByText("石材材质流程")).toBeTruthy();
    preferenceMock.openEditorAfterCreate = true;
  });
});
