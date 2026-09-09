import { describe, expect, it } from "vitest";
import { APP_BREAKPOINTS, shouldCollapseSidebar, shouldOverlayTodayDetail } from "./layoutBreakpoints";

describe("桌面窗口断点", () => {
  it("侧栏在 960px 以下折叠", () => {
    expect(shouldCollapseSidebar(APP_BREAKPOINTS.sidebarCollapse - 1)).toBe(true);
    expect(shouldCollapseSidebar(APP_BREAKPOINTS.sidebarCollapse)).toBe(false);
  });

  it("今日详情在 1180px 以下改为浮层", () => {
    expect(shouldOverlayTodayDetail(APP_BREAKPOINTS.todayDetailOverlay - 1)).toBe(true);
    expect(shouldOverlayTodayDetail(APP_BREAKPOINTS.todayDetailOverlay)).toBe(false);
  });
});
