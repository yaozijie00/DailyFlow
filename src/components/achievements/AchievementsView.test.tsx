// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AchievementsView from "./AchievementsView";

const state = vi.hoisted(() => ({ items: [
  { id: "first", name: "第一步", description: "完成一个任务", category: "tasks", icon: "Trophy", current: 1, target: 1, unit: "count", percentage: 100, unlocked: true, hidden: false },
  { id: "zero", name: "持续投入", description: "积累真实的专注时长", category: "tasks", icon: "Trophy", current: 0, target: 100, unit: "minutes", percentage: 0, unlocked: false, hidden: false },
  { id: "secret", name: "秘密名称", description: "秘密条件", category: "tasks", icon: "Trophy", current: 2, target: 5, unit: "count", percentage: 40, unlocked: false, hidden: true },
], loading: false, filter: "all", setFilter: vi.fn(), totals: { unlocked: 1, total: 3 }, load: vi.fn() }));
vi.mock("../../stores/achievementStore", () => ({ useAchievementStore: Object.assign((select: (s: unknown) => unknown) => select(state), { getState: () => state }) }));
vi.mock("../../stores/appStore", () => ({ useAppStore: (select: (s: unknown) => unknown) => select({ dbStatus: "idle" }) }));
vi.mock("../../features/focus/focusStore", () => ({ useFocusStore: (select: (s: unknown) => unknown) => select({ focusVersion: 0 }) }));
afterEach(cleanup);

it("uses a common footer for every achievement and represents zero progress honestly", () => {
  const { container } = render(<AchievementsView />);
  expect(container.querySelectorAll(".achievement-card-footer")).toHaveLength(3);
  const bars = screen.getAllByRole("progressbar");
  expect(bars.map((bar) => bar.getAttribute("aria-valuenow"))).toEqual(["100", "0"]);
  expect((bars[1].firstElementChild as HTMLElement).style.width).toBe("0%");
});

it("keeps hidden achievement information concealed when opening its details", () => {
  render(<AchievementsView />);
  fireEvent.click(screen.getByRole("button", { name: "隐藏成就，达成后揭晓" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByText("秘密名称")).toBeNull();
  expect(screen.queryByText("秘密条件")).toBeNull();
});

it("shows the complete description in details and exposes filter selection", () => {
  render(<AchievementsView />);
  fireEvent.click(screen.getByRole("button", { name: "第一步，已解锁" }));
  expect(screen.getByRole("dialog").textContent).toContain("完成一个任务");
  expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true");
});
