import { useFocusStore } from "../../features/focus/focusStore";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Timer,
  Target,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  Trophy,
  Search,
  StickyNote,
} from "lucide-react";
import { useAppStore, type Page } from "../../stores/appStore";
import { useTaskStore } from "../../stores/taskStore";
import { useStatisticsStore } from "../../stores/statisticsStore";
import { goalService } from "../../stores/goalStore";
import { noteService } from "../../stores/noteStore";
import type { Task } from "../../db/repositories/taskRepository";
import type { Goal } from "../../db/repositories/goalRepository";
import type { Note } from "../../db/repositories/noteRepository";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

import { useSearchNavigationStore } from "../../stores/searchNavigationStore";
import { useLongTermPlanStore } from "../../stores/longTermPlanStore";

const PAGE_ICONS: Record<Page, typeof CalendarDays> = {
  today: CalendarDays,
  focus: Timer,
  goals: Target,
  statistics: BarChart3,
  settings: SettingsIcon,
};

const PAGE_LABELS: Record<Page, string> = {
  today: "今日",
  focus: "专注",
  goals: "长期",
  statistics: "统计",
  settings: "设置",
};

function taskStatusText(t: Task): string {
  if (t.status === "COMPLETED") return "已完成";
  if (t.status === "CANCELLED") return "已取消";
  return "待办";
}

interface Entry {
  id: string;
  title: string;
  sub?: string;
  icon: ReactNode;
  muted?: boolean;
  run: () => void;
}

interface SearchResults {
  tasks: Task[];
  goals: Goal[];
  notes: Note[];
}

/**
 * Ctrl+K 命令面板（v1.7 扩展为跨类型搜索）：
 * - 打开：Ctrl/Cmd+K；关闭：Esc / 点击遮罩；
 * - 上半区：页面跳转 + 常用动作；输入后：全库搜索 任务/长期目标/便签；
 * - 任务可跳到对应日期并选中；目标跳长期页；便签跳今日页；
 * - ↑↓ 选择、Enter 执行、鼠标悬停即选中。
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults>({ tasks: [], goals: [], notes: [] });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  useOverlayFocus(open, panelRef);
  useEffect(() => {
    if (open) panelRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQ("");
    setResults({ tasks: [], goals: [], notes: [] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat || e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setResults({ tasks: [], goals: [], notes: [] });
        setActive(0);
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  // 输入防抖搜索（任务/目标/便签并发）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const term = q.trim();
    setSearchError(false);
    setResults({ tasks: [], goals: [], notes: [] });
    if (!term) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(() => {
      void Promise.all([
        useTaskStore.getState().searchTasks(term),
        goalService.searchTitles(term),
        noteService.searchTitles(term),
      ])
        .then(([tasks, goals, notes]) => {
          if (cancelled) return;
          setResults({ tasks, goals, notes });
          setActive(0);
        })
        .catch(() => { if (!cancelled) setSearchError(true); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [q, open]);

  if (!open) return null;

  const app = useAppStore.getState();

  const staticEntries: Entry[] = [
    ...(Object.keys(PAGE_ICONS) as Page[]).map((page) => ({
      id: `nav-${page}`,
      title: `打开${PAGE_LABELS[page]}`,
      icon: (() => {
        const Icon = PAGE_ICONS[page];
        return <Icon size={15} />;
      })(),
      run: () => app.setPage(page),
    })),
    {
      id: "act-create",
      title: "新建任务",
      sub: "Ctrl+N · 跳到今日并打开新建",
      icon: <Plus size={15} />,
      run: () => {
        app.setPage("today");
        useTaskStore.getState().openCreate();
      },
    },
    {
      id: "act-achievements",
      title: "打开成就",
      icon: <Trophy size={15} />,
      run: () => {
        useStatisticsStore.getState().setTab("achievements");
        app.setPage("statistics");
      },
    },
  ];

  const taskEntries: Entry[] = results.tasks.map((t) => ({
    id: `task-${t.id}`,
    title: t.title,
    sub: `任务 · ${t.scheduledDate} · ${taskStatusText(t)}`,
    muted: t.status !== "TODO",
    icon: (
      <span
        className={`h-2 w-2 rounded-full ${
          t.status === "COMPLETED"
            ? "bg-success"
            : t.status === "CANCELLED"
              ? "bg-text-faint"
              : "bg-accent"
        }`}
      />
    ),
    run: () => {
      app.setPage("today");
      const s = useTaskStore.getState();
      if (t.scheduledDate) s.setSelectedDate(t.scheduledDate);
      s.openTaskDetail(t.id);
    },
  }));

  const goalEntries: Entry[] = results.goals.map((g) => ({
    id: `goal-${g.id}`,
    title: g.title,
    sub: `目标 · ${g.status === "completed" ? "已完成" : "进行中"}`,
    muted: g.status === "completed",
    icon: <Target size={15} />,
    run: () => {
      void useLongTermPlanStore.getState().selectPlan(null);
      useSearchNavigationStore.getState().openGoal(g.id);
      app.setPage("goals");
    },
  }));

  const noteEntries: Entry[] = results.notes.map((n) => ({
    id: `note-${n.id}`,
    title: n.title,
    sub: n.status === "saved" ? "笔记" : `收集箱 · ${n.status === "arranged" ? "已安排" : "待处理"}`,
    icon: <StickyNote size={15} className="text-amber-500" />,
    run: () => {
      useSearchNavigationStore.getState().openNote(n.id);
      app.setPage("today");
    },
  }));

  const entries: Entry[] = [
    ...staticEntries.filter((entry) => !q.trim() || entry.title.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())),
    ...taskEntries,
    ...results.tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).map((task) => ({ id: `focus-${task.id}`, title: `开始专注 · ${task.title}`, sub: "记录真实投入", icon: <Timer size={15} />, run: () => { void useFocusStore.getState().start(task.id); } })),
    ...goalEntries,
    ...noteEntries,
  ];

  const total = results.tasks.length + results.goals.length + results.notes.length;

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (entries.length === 0 ? 0 : (a + 1) % entries.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (entries.length === 0 ? 0 : (a - 1 + entries.length) % entries.length));
    } else if (e.key === "Enter") {
      const entry = entries[active];
      if (entry) {
        entry.run();
        close();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/30 px-4 pb-4 pt-[10vh]"
      onClick={close}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="命令与搜索"
        tabIndex={-1}
        className="flex max-h-[80vh] w-[560px] max-w-full flex-col overflow-hidden rounded-[var(--radius-floating)] border border-border-subtle bg-bg-elevated shadow-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3">
          <Search size={15} className="shrink-0 text-text-faint" />
          <input
            ref={inputRef}
            aria-label="搜索任务、目标、便签和命令"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={entries[active] ? `command-${entries[active].id}` : undefined}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="跳转页面、新建任务，或搜索 任务/目标/便签…"
            className="w-full bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-faint"
          />
          <span className="shrink-0 rounded border border-border-subtle px-1 text-[10px] text-text-faint">
            Esc
          </span>
        </div>

        <div id="command-results" role="listbox" aria-label="搜索结果" aria-busy={searching} className="df-scroll-area max-h-80 p-1">
          {entries.map((entry, i) => (
            <button
              key={entry.id}
              id={`command-${entry.id}`}
              role="option"
              aria-selected={active === i}
              data-active={active === i}
              tabIndex={-1}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                entry.run();
                close();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                active === i ? "bg-surface-hover" : ""
              }`}
            >
              <span className="shrink-0 text-text-muted">{entry.icon}</span>
              <span
                className={`min-w-0 flex-1 truncate ${entry.muted ? "text-text-faint" : "text-text-primary"}`}
              >
                {entry.title}
              </span>
              {entry.sub && (
                <span className="max-w-[45%] truncate text-caption text-text-muted">{entry.sub}</span>
              )}
            </button>
          ))}
          {q.trim() !== "" && total === 0 && !searching && !searchError && entries.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-text-faint">
              没有匹配的结果
            </div>
          )}
        </div>
        {searching && <p role="status" className="px-4 py-2 text-caption text-text-muted">正在搜索本机数据…</p>}
        {searchError && <p role="alert" className="px-4 py-2 text-caption text-danger">搜索失败，请重新输入关键词重试；本机数据未更改。</p>}

        <div className="flex items-center gap-3 border-t border-border-subtle px-3 py-1.5 text-[10px] text-text-faint">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
