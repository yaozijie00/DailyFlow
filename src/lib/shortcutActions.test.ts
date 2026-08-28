// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach } from "vitest";

// vi.mock 工厂会被提升（hoist）到 import 之前执行，因此 mocks / pomodoroState
// 必须用 vi.hoisted 初始化，避免 TDZ；getState 闭包每次调用读取当前值。
const mocks = vi.hoisted(() => ({
  setPage: vi.fn(),
  pushToast: vi.fn(),
  openCreate: vi.fn(),
  completeTask: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  show: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
}));

/** 番茄钟状态（可变对象：mock 的 getState 每次调用读取 pomodoroState.value）。 */
const pomodoroState = vi.hoisted(() => ({ value: "IDLE" }));

vi.mock("../stores/appStore", () => ({
  useAppStore: {
    getState: () => ({ setPage: mocks.setPage, pushToast: mocks.pushToast }),
  },
}));
vi.mock("../stores/taskStore", () => ({
  useTaskStore: {
    getState: () => ({
      openCreate: mocks.openCreate,
      completeTask: mocks.completeTask,
      selectedTaskId: 1,
    }),
  },
}));
vi.mock("../stores/pomodoroStore", () => ({
  usePomodoroStore: {
    getState: () => ({
      snapshot: { state: pomodoroState.value },
      pause: mocks.pause,
      resume: mocks.resume,
    }),
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: mocks.show,
    unminimize: mocks.unminimize,
    setFocus: mocks.setFocus,
  }),
}));

import { dispatchShortcut } from "./shortcutActions";

describe("dispatchShortcut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("open_today / open_focus / open_settings 切换页面", () => {
    dispatchShortcut("open_today");
    expect(mocks.setPage).toHaveBeenCalledWith("today");
    dispatchShortcut("open_focus");
    expect(mocks.setPage).toHaveBeenCalledWith("focus");
    dispatchShortcut("open_settings");
    expect(mocks.setPage).toHaveBeenCalledWith("settings");
  });

  test("create_task 切到今日并打开新建弹窗", () => {
    dispatchShortcut("create_task");
    expect(mocks.setPage).toHaveBeenCalledWith("today");
    expect(mocks.openCreate).toHaveBeenCalled();
  });

  test("complete_task 完成选中任务", () => {
    dispatchShortcut("complete_task");
    expect(mocks.completeTask).toHaveBeenCalledWith(1);
  });

  test("pomodoro_toggle 运行中→暂停、暂停→继续、空闲→提示", () => {
    pomodoroState.value = "RUNNING";
    dispatchShortcut("pomodoro_toggle");
    expect(mocks.pause).toHaveBeenCalled();

    pomodoroState.value = "PAUSED";
    dispatchShortcut("pomodoro_toggle");
    expect(mocks.resume).toHaveBeenCalled();

    pomodoroState.value = "IDLE";
    dispatchShortcut("pomodoro_toggle");
    expect(mocks.pushToast).toHaveBeenCalledWith("info", expect.stringContaining("专注"));
  });

  test("open_dailyflow 唤起窗口", () => {
    dispatchShortcut("open_dailyflow");
    expect(mocks.show).toHaveBeenCalled();
    expect(mocks.unminimize).toHaveBeenCalled();
    expect(mocks.setFocus).toHaveBeenCalled();
  });
});
