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
  it("展示三项今日决策指标（待完成/计划进度/已专注）", () => {
    render(<TodaySummary />);
    expect(screen.getByText("待完成")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("计划进度")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByText("已专注")).toBeTruthy();
    expect(screen.getByText("40分钟")).toBeTruthy(); // 2400 秒
    expect(screen.getByText("2 次专注")).toBeTruthy();
  });
});
