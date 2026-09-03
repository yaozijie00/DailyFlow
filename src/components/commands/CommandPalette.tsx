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

  const close = () => {
    setOpen(false);
    setQ("");
    setResults({ tasks: [], goals: [], notes: [] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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
    const term = q.trim();
    if (!term) {
      setResults({ tasks: [], goals: [], notes: [] });
      return;
    }
    const id = window.setTimeout(() => {
      void Promise.all([
        useTaskStore.getState().searchTasks(term),
        goalService.searchTitles(term),
        noteService.searchTitles(term),
      ])
        .then(([tasks, goals, notes]) => {
          setResults({ tasks, goals, notes });
          setActive(0);
        })
        .catch(() => setResults({ tasks: [], goals: [], notes: [] }));
    }, 150);
    return () => window.clearTimeout(id);
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
            ? "bg-green-500"
            : t.status === "CANCELLED"
              ? "bg-neutral-300"
              : "bg-neutral-800"
        }`}
      />
    ),
    run: () => {
      app.setPage("today");
      const s = useTaskStore.getState();
      s.setSelectedDate(t.scheduledDate);
      s.selectTask(t.id);
    },
  }));

  const goalEntries: Entry[] = results.goals.map((g) => ({
    id: `goal-${g.id}`,
    title: g.title,
    sub: `目标 · ${g.status === "completed" ? "已完成" : "进行中"}`,
    muted: g.status === "completed",
    icon: <Target size={15} />,
    run: () => {
      app.setPage("goals");
    },
  }));

  const noteEntries: Entry[] = results.notes.map((n) => ({
    id: `note-${n.id}`,
    title: n.title,
    sub: `便签 · ${n.status === "arranged" ? "已安排" : "未安排"}`,
    icon: <StickyNote size={15} className="text-amber-500" />,
    run: () => {
      app.setPage("today");
    },
  }));

  const entries: Entry[] = [
    ...staticEntries,
    ...taskEntries,
    ...goalEntries,
    ...noteEntries,
  ];

  const total = results.tasks.length + results.goals.length + results.notes.length;

  const onInputKeyDown = (e: React.KeyboardEvent) => {
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
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/30 pt-[14vh]"
      onClick={close}
    >
      <div
        className="w-[500px] max-w-[92vw] overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
          <Search size={15} className="shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="跳转页面、新建任务，或搜索 任务/目标/便签…"
            className="w-full bg-transparent py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
          <span className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400">
            Esc
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {entries.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                entry.run();
                close();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                active === i ? "bg-neutral-100" : ""
              }`}
            >
              <span className="shrink-0 text-neutral-500">{entry.icon}</span>
              <span
                className={`min-w-0 flex-1 truncate ${entry.muted ? "text-neutral-400" : "text-neutral-800"}`}
              >
                {entry.title}
              </span>
              {entry.sub && (
                <span className="shrink-0 text-xs text-neutral-400">{entry.sub}</span>
              )}
            </button>
          ))}
          {q.trim() !== "" && total === 0 && (
            <div className="px-3 py-4 text-center text-xs text-neutral-400">
              没有匹配的结果
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
