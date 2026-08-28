// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TodaySummary from "./TodaySummary";

afterEach(cleanup);

vi.mock("../../hooks/useTodayStats", () => ({
  useTodayStats: () => ({
    totalTasks: 3,
    completedTasks: 1,
    completionRate: 1 / 3,
    totalFocusSeconds: 2400,
    focusCount: 2,
  }),
}));

describe("TodaySummary", () => {
  it("展示五项今日统计（任务/完成/完成率/专注时长/专注次数）", () => {
    render(<TodaySummary />);
    expect(screen.getByText("今日任务")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByText("40分钟")).toBeTruthy(); // 2400 秒
    expect(screen.getByText("2")).toBeTruthy();
  });
});
