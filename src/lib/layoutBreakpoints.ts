/** DailyFlow 桌面布局断点的单一来源。 */
export const APP_BREAKPOINTS = {
  sidebarCollapse: 960,
  todayDetailOverlay: 1180,
} as const;

export function shouldCollapseSidebar(width: number): boolean {
  return width < APP_BREAKPOINTS.sidebarCollapse;
}

export function shouldOverlayTodayDetail(width: number): boolean {
  return width < APP_BREAKPOINTS.todayDetailOverlay;
}
