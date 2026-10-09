// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import GlobalFocusBar from "./GlobalFocusBar";
import { useFocusStore } from "../../features/focus/focusStore";
import type { FocusRecord, FocusRequest } from "../../features/focus/types";
import { useTaskStore } from "../../stores/taskStore";
import { useAppStore } from "../../stores/appStore";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("../../services/achievementRuntime", () => ({ evaluateAndNotify: vi.fn() }));

const now = 1_800_000_000_000;
function record(partial: Partial<FocusRecord> = {}): FocusRecord {
  return {
    id: 11, taskId: 7, taskTitle: "写代码", startedAt: now - 300_000,
    endedAt: null, actualSeconds: 300, status: "running", runningSince: now,
    pausedAt: null, goalSeconds: 1500, mode: "countdown", note: "", nextAction: "",
    interruptionCount: 0, source: "timer", checkpointAt: now, revision: 1, ...partial,
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  useFocusStore.setState(useFocusStore.getInitialState(), true);
  useAppStore.setState({ currentPage: "today" });
  vi.spyOn(useTaskStore.getState(), "load").mockResolvedValue(undefined);
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (_command: string, { request }: { request: FocusRequest }) => ({
    active: request.action === "finish" ? null : record({ status: "paused", runningSince: null, pausedAt: now, revision: 2 }),
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GlobalFocusBar", () => {
  it("专注页隐藏重复浮动条，仍保留结束面板", () => {
    useAppStore.setState({ currentPage: "focus" });
    useFocusStore.setState({ active: record(), finishOpen: false });
    const view = render(<GlobalFocusBar />);
    expect(screen.queryByRole("complementary", { name: "当前专注" })).toBeNull();
    useFocusStore.setState({ finishOpen: true });
    view.rerender(<GlobalFocusBar />);
    expect(screen.getByRole("dialog", { name: "结束本次专注" })).toBeTruthy();
  });
  it("错误面板刷新状态不会提交结束表单", async () => {
    useFocusStore.setState({ active: record({ status: "paused", runningSince: null }), finishOpen: true, error: "保存失败" });
    const perform = vi.spyOn(useFocusStore.getState(), "perform");
    render(<GlobalFocusBar />);
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("focus_execute", { request: { action: "read" } }));
    expect(perform).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "结束本次专注" })).toBeTruthy();
  });

  it("专注条可键盘移动、复位，并保持在窗口内", () => {
    useFocusStore.setState({ active: record() });
    render(<GlobalFocusBar />);
    const bar = screen.getByRole("complementary", { name: "当前专注" });
    const handle = screen.getByRole("button", { name: "移动专注条" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(bar.style.left).toBe("8px");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(bar.style.left).toBe("");
  });

  it("没有活动专注时隐藏", () => {
    render(<GlobalFocusBar />);
    expect(screen.queryByRole("complementary", { name: "当前专注" })).toBeNull();
  });

  it("显示任务、已投入时间与控制按钮，不将目标剩余时间当作投入", () => {
    useFocusStore.setState({ active: record() });
    render(<GlobalFocusBar />);
    expect(screen.getByText("写代码")).toBeTruthy();
    expect(screen.getByText("专注中")).toBeTruthy();
    expect(screen.getByLabelText("本次已投入").textContent).toBe("05:00");
    expect(screen.queryByText("20:00")).toBeNull();
    expect(screen.getByRole("button", { name: "暂停" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "结束本次" })).toBeTruthy();
  });

  it.each([ ["running", "暂停", "pause"], ["paused", "继续", "resume"] ] as const)(
    "%s 状态调用 %s 操作且不跳转", (status, label, action) => {
      useFocusStore.setState({ active: record({ status, runningSince: status === "running" ? now : null }) });
      const perform = vi.spyOn(useFocusStore.getState(), "perform").mockResolvedValue(true);
      render(<GlobalFocusBar />);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(perform).toHaveBeenCalledWith({ action });
      expect(useAppStore.getState().currentPage).toBe("today");
    },
  );

  it("点击任务跳转专注页，保持当前计时", () => {
    const active = record();
    useFocusStore.setState({ active });
    const perform = vi.spyOn(useFocusStore.getState(), "perform");
    render(<GlobalFocusBar />);
    fireEvent.click(screen.getByText("写代码"));
    expect(useAppStore.getState().currentPage).toBe("focus");
    expect(useFocusStore.getState().active).toBe(active);
    expect(perform).not.toHaveBeenCalled();
  });

  it("结束先暂停，保存默认保留任务未完成", async () => {
    useFocusStore.setState({ active: record() });
    render(<GlobalFocusBar />);
    fireEvent.click(screen.getByRole("button", { name: "结束本次" }));
    await screen.findByRole("dialog", { name: "结束本次专注" });
    expect(invokeMock).toHaveBeenCalledWith("focus_execute", { request: expect.objectContaining({ action: "pause" }) });
    expect(useFocusStore.getState().active?.status).toBe("paused");
    expect((screen.getByLabelText("同时完成任务") as HTMLInputElement).checked).toBe(false);
    expect(useAppStore.getState().currentPage).toBe("today");
    fireEvent.click(screen.getByRole("button", { name: "保存投入" }));
    await waitFor(() => expect(useFocusStore.getState().active).toBeNull());
    expect(invokeMock).toHaveBeenLastCalledWith("focus_execute", { request: expect.objectContaining({ action: "finish", completeTask: false }) });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("保存失败保留备注和下一步，重试成功后关闭", async () => {
    useFocusStore.setState({ active: record({ status: "paused", runningSince: null }), finishOpen: true });
    invokeMock.mockRejectedValueOnce(new Error("磁盘写入失败"));
    render(<GlobalFocusBar />);
    fireEvent.change(screen.getByLabelText("本次备注（可选）"), { target: { value: "完成草稿" } });
    fireEvent.change(screen.getByLabelText("下一步（可选）"), { target: { value: "补充测试" } });
    fireEvent.click(screen.getByRole("button", { name: "保存投入" }));
    await screen.findByRole("alert");
    expect((screen.getByLabelText("本次备注（可选）") as HTMLTextAreaElement).value).toBe("完成草稿");
    expect((screen.getByLabelText("下一步（可选）") as HTMLInputElement).value).toBe("补充测试");
    const failedRequest = useFocusStore.getState().failedRequest;
    fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(invokeMock).toHaveBeenLastCalledWith("focus_execute", { request: failedRequest });
  });
});
