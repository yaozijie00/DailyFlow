import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Timer,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  BookOpen,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAppStore, type Page } from "../stores/appStore";
import { useEnabledNavItems } from "../extensions/host";
import { useLayoutModeStore } from "../lib/layoutMode";
import TitleBar from "./TitleBar";
import Toasts from "./Toasts";
import GlobalFocusBar from "./pomodoro/GlobalFocusBar";
import UndoButtons from "./undo/UndoButtons";
import CommandPalette from "./commands/CommandPalette";
import QuickCapture from "./commands/QuickCapture";
import { LayoutModeSwitcher } from "./LayoutModeSwitcher";
import { APP_BREAKPOINTS } from "../lib/layoutBreakpoints";

type NavIcon = typeof CalendarDays;

interface NavItem {
  page: Page;
  label: string;
  icon: NavIcon;
}

/** 核心区：DailyFlow 自带功能页（设置单独归入「系统」区）。 */
const coreNavItems: NavItem[] = [
  { page: "today", label: "今日", icon: CalendarDays },
  { page: "focus", label: "专注", icon: Timer },
  { page: "goals", label: "长期", icon: Target },
  { page: "statistics", label: "统计", icon: BarChart3 },
];

/** 系统区：应用设置。 */
const systemNavItems: NavItem[] = [{ page: "settings", label: "设置", icon: SettingsIcon }];

const SIDEBAR_KEY = "df.sidebarCollapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function GroupTitle({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-text-faint">
      {children}
    </div>
  );
}

function NavButton({
  item,
  current,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  current: Page;
  onNavigate: (page: Page) => void;
  collapsed: boolean;
}) {
  const { page, label, icon: Icon } = item;
  return (
    <button
      onClick={() => onNavigate(page)}
      aria-current={current === page ? "page" : undefined}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={`relative flex min-h-11 w-full items-center rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
        collapsed ? "justify-center px-0 py-2.5" : "gap-2 px-3 py-2"
      } ${
        current === page
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      } ${
        current === page && !collapsed
          ? "before:absolute before:left-0 before:h-4 before:w-[3px] before:rounded-full before:bg-accent before:content-['']"
          : ""
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && label}
    </button>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const dbStatus = useAppStore((s) => s.dbStatus);
  const dbError = useAppStore((s) => s.dbError);
  // Extension 贡献的导航项（仅启用且激活成功者出现；图标由 Core 统一提供，保证设计系统一致）
  const extensionNav = useEnabledNavItems();
  const core: NavItem[] = coreNavItems;
  const extensions: NavItem[] = extensionNav.map((n) => ({
    page: n.page as Page,
    label: n.label,
    icon: BookOpen,
  }));
  const system: NavItem[] = systemNavItems;
  // A3：会话级视图模式（standard/compact/focus）注入根容器 data 属性，
  // 供页面/组件读取做密度与内容优先级适配
  const layoutMode = useLayoutModeStore((s) => s.current);
  const mainPad = layoutMode === "compact" ? "p-4" : layoutMode === "focus" ? "p-5" : "p-6";

  // 侧栏折叠（R2 响应式）：窄态为图标条（w-14），偏好本地记忆
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // 窄窗口（< 960px）首次自动折叠（仅在未手动设定过时）
  const [autoApplied, setAutoApplied] = useState(false);
  useEffect(() => {
    if (autoApplied) return;
    try {
      if (localStorage.getItem(SIDEBAR_KEY) != null) {
        setAutoApplied(true);
        return;
      }
    } catch {
      /* ignore */
    }
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(max-width: ${APP_BREAKPOINTS.sidebarCollapse - 1}px)`)
        : null;
    if (mq?.matches) setCollapsed(true);
    setAutoApplied(true);
  }, [autoApplied]);

  return (
    <div className="flex h-screen flex-col bg-bg-app text-text-primary" data-layout-mode={layoutMode}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <aside
          data-collapsed={collapsed}
          className={`df-sidebar glass-surface flex shrink-0 flex-col rounded-r-xl transition-[width] duration-200 ${
            collapsed ? "w-14" : "w-56"
          }`}
        >
          {/* 折叠开关 */}
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            title={collapsed ? "展开侧栏" : "折叠侧栏"}
            className={`flex min-h-11 items-center justify-center py-2 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-primary ${
              collapsed ? "" : "justify-end pr-2"
            }`}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="主导航">
            <GroupTitle collapsed={collapsed}>核心</GroupTitle>
            {core.map((item) => (
              <NavButton
                key={item.page}
                item={item}
                current={currentPage}
                onNavigate={setPage}
                collapsed={collapsed}
              />
            ))}
            {extensions.length > 0 && (
              <>
                <GroupTitle collapsed={collapsed}>扩展</GroupTitle>
                {extensions.map((item) => (
                  <NavButton
                    key={item.page}
                    item={item}
                    current={currentPage}
                    onNavigate={setPage}
                    collapsed={collapsed}
                  />
                ))}
              </>
            )}
            <GroupTitle collapsed={collapsed}>系统</GroupTitle>
            {system.map((item) => (
              <NavButton
                key={item.page}
                item={item}
                current={currentPage}
                onNavigate={setPage}
                collapsed={collapsed}
              />
            ))}
          </nav>
          {/* 折叠态隐藏次要行，仅保留视图模式入口 */}
          {!collapsed && (
            <>
              <div className="df-layout-db relative border-t border-border-subtle px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text-faint">
                    视图模式
                  </span>
                  <span className="text-[10px] text-text-faint">会话</span>
                </div>
                <LayoutModeSwitcher />
              </div>
              <div className="df-layout-status border-t border-border-subtle p-3 text-xs text-text-muted">
                {dbStatus === "ready" && (
                  <span className="flex items-center gap-1">
                    <Database size={12} />
                    已保存到本机
                  </span>
                )}
                {dbStatus === "error" && (
                  <span className="text-danger">数据库错误：{dbError}</span>
                )}
                {dbStatus === "idle" && "正在准备本机数据…"}
              </div>
              <div className="df-layout-undo flex items-center justify-between border-t border-border-subtle px-3 py-2">
                <span className="text-xs text-text-faint">撤销/重做</span>
                <UndoButtons />
              </div>
            </>
          )}
          {collapsed && (
            <div className="flex flex-col items-center gap-1 border-t border-border-subtle py-2">
              <LayoutModeSwitcher collapsed />
            </div>
          )}
        </aside>
        <main className={`min-w-0 flex-1 overflow-auto ${mainPad}`}>{children}</main>
      </div>
      <Toasts />
      <GlobalFocusBar />
      <CommandPalette />
      <QuickCapture />
    </div>
  );
}
