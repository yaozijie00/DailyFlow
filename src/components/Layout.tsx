import type { ReactNode } from "react";
import {
  CalendarDays,
  Timer,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  BookOpen,
  Database,
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

function GroupTitle({ children }: { children: ReactNode }) {
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
}: {
  item: NavItem;
  current: Page;
  onNavigate: (page: Page) => void;
}) {
  const { page, label, icon: Icon } = item;
  return (
    <button
      onClick={() => onNavigate(page)}
      aria-current={current === page ? "page" : undefined}
      className={`relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
        current === page
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      } ${
        current === page
          ? "before:absolute before:left-0 before:h-4 before:w-[3px] before:rounded-full before:bg-accent before:content-['']"
          : ""
      }`}
    >
      <Icon size={16} />
      {label}
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

  return (
    <div className="flex h-screen flex-col bg-bg-app text-text-primary" data-layout-mode={layoutMode}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <aside className="glass-surface flex w-56 shrink-0 flex-col rounded-r-xl">
          <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="主导航">
            <GroupTitle>核心</GroupTitle>
            {core.map((item) => (
              <NavButton key={item.page} item={item} current={currentPage} onNavigate={setPage} />
            ))}
            {extensions.length > 0 && (
              <>
                <GroupTitle>扩展</GroupTitle>
                {extensions.map((item) => (
                  <NavButton key={item.page} item={item} current={currentPage} onNavigate={setPage} />
                ))}
              </>
            )}
            <GroupTitle>系统</GroupTitle>
            {system.map((item) => (
              <NavButton key={item.page} item={item} current={currentPage} onNavigate={setPage} />
            ))}
          </nav>
          <div className="relative border-t border-border-subtle px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-faint">
                视图模式
              </span>
              <span className="text-[10px] text-text-faint">会话</span>
            </div>
            <LayoutModeSwitcher />
          </div>
          <div className="border-t border-border-subtle p-3 text-xs text-text-muted">
            {dbStatus === "ready" && (
              <span className="flex items-center gap-1">
                <Database size={12} />
                SQLite 已连接
              </span>
            )}
            {dbStatus === "error" && (
              <span className="text-danger">数据库错误：{dbError}</span>
            )}
            {dbStatus === "idle" && "数据库初始化中…"}
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2">
            <span className="text-xs text-text-faint">撤销/重做</span>
            <UndoButtons />
          </div>
        </aside>
        <main className={`flex-1 overflow-auto ${mainPad}`}>{children}</main>
      </div>
      <Toasts />
      <GlobalFocusBar />
      <CommandPalette />
      <QuickCapture />
    </div>
  );
}
