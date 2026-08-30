import { describe, it, expect, afterEach, vi } from "vitest";
import { useAppStore } from "./appStore";

afterEach(() => {
  // 重置 toast 状态，避免用例间串扰
  useAppStore.setState({ toasts: [], achievementToasts: [] });
  vi.useRealTimers();
});

describe("appStore.toasts", () => {
  it("pushToast 追加一条 toast", () => {
    useAppStore.getState().pushToast("error", "操作失败");
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ type: "error", text: "操作失败" });
  });

  it("removeToast 移除指定 toast", () => {
    useAppStore.getState().pushToast("info", "a");
    useAppStore.getState().pushToast("success", "b");
    const [first] = useAppStore.getState().toasts;
    useAppStore.getState().removeToast(first.id);
    const toasts = useAppStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toBe("b");
  });

  it("toast 3.5 秒后自动消失", () => {
    vi.useFakeTimers();
    useAppStore.getState().pushToast("info", "自动消失");
    expect(useAppStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3600);
    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});

describe("appStore.achievementToasts", () => {
  it("pushAchievement 追加一条成就提示，5 秒后自动消失", () => {
    vi.useFakeTimers();
    useAppStore.getState().pushAchievement("第一步", "完成第一个番茄钟");
    const list = useAppStore.getState().achievementToasts;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "第一步", description: "完成第一个番茄钟" });

    vi.advanceTimersByTime(5100);
    expect(useAppStore.getState().achievementToasts).toHaveLength(0);
  });

  it("removeAchievementToast 移除指定提示", () => {
    useAppStore.getState().pushAchievement("A", "a");
    useAppStore.getState().pushAchievement("B", "b");
    const [first] = useAppStore.getState().achievementToasts;
    useAppStore.getState().removeAchievementToast(first.id);
    const list = useAppStore.getState().achievementToasts;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("B");
  });
});
