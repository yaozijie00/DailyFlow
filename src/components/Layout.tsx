import type { ReactNode } from "react";
import {
  CalendarDays,
  Timer,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  Database,
} from "lucide-react";
import { useAppStore, type Page } from "../stores/appStore";
import Toasts from "./Toasts";
import GlobalFocusBar from "./pomodoro/GlobalFocusBar";
import UndoButtons from "./undo/UndoButtons";
import CommandPalette from "./commands/CommandPalette";
import QuickCapture from "./commands/QuickCapture";

const navItems: { page: Page; label: string; icon: typeof CalendarDays }[] = [
  { page: "today", label: "今日", icon: CalendarDays },
  { page: "focus", label: "专注", icon: Timer },
  { page: "goals", label: "长期", icon: Target },
  { page: "statistics", label: "统计", icon: BarChart3 },
  { page: "settings", label: "设置", icon: SettingsIcon },
];

export default function Layout({ children }: { children: ReactNode }) {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const dbStatus = useAppStore((s) => s.dbStatus);
  const dbError = useAppStore((s) => s.dbError);

  return (
    <div className="flex h-screen bg-neutral-100 text-neutral-900">
      <aside className="flex w-56 flex-col border-r border-neutral-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-neutral-200 px-4">
          <span className="text-lg font-semibold">DailyFlow</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              onClick={() => setPage(page)}
              aria-current={currentPage === page ? "page" : undefined}
              className={`relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30 ${
                currentPage === page
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-900"
              } ${
                currentPage === page
                  ? "before:absolute before:left-0 before:h-4 before:w-[3px] before:rounded-full before:bg-neutral-900 before:content-['']"
                  : ""
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="border-t border-neutral-200 p-3 text-xs text-neutral-500">
          {dbStatus === "ready" && (
            <span className="flex items-center gap-1">
              <Database size={12} />
              SQLite 已连接
            </span>
          )}
          {dbStatus === "error" && (
            <span className="text-red-500">数据库错误：{dbError}</span>
          )}
          {dbStatus === "idle" && "数据库初始化中…"}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2">
          <span className="text-xs text-neutral-400">撤销/重做</span>
          <UndoButtons />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <Toasts />
      <GlobalFocusBar />
      <CommandPalette />
      <QuickCapture />
    </div>
  );
}
