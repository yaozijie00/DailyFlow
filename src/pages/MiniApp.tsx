import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronLeft, Plus, X } from "lucide-react";
import { getDb } from "../db/db";
import { TaskRepository, type Task } from "../db/repositories/taskRepository";
import { TaskService } from "../services/taskService";
import { FocusSessionRepository } from "../db/repositories/focusSessionRepository";
import { todayString } from "../lib/date";
import { taskPriorityMeta } from "../lib/taskPriority";
import FocusController, { FocusBridge } from "../features/focus/FocusController";
import { useFocusStore } from "../features/focus/focusStore";
import { useSettingsStore } from "../stores/settingsStore";
import { ProgressRing } from "../components/mini/ProgressRing";

/**
 * DailyFlow Mini 窗（V2.4 重设计）：
 * - 自绘迷你标题条（无边框窗口可拖拽）；
 * - 专注倒计时圆环（与主窗 pomodoroStore 同源，可暂停/继续）；
 * - 今日进度环（完成/总数）；
 * - 快速添加输入框（回车建今日任务，广播 df:tasks-changed）；
 * - 今日任务精简列表（任务/时间/优先级/完成）。
 * 数据与操作全部经 Core Task Service / PomodoroStore，跨窗经 df:tasks-changed 同步。
 */
const taskRepository = new TaskRepository(getDb());
const taskService = new TaskService(
  taskRepository,
  new FocusSessionRepository(getDb()),
);

function timeLabel(t: Task): string {
  if (t.plannedStart == null) return "";
  const d = new Date(t.plannedStart);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MiniApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [counts, setCounts] = useState({ total:0, completed:0 });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusVersion = useFocusStore((s) => s.focusVersion);

  const load = useCallback(async () => {
    try {
      const [rows,stats] = await Promise.all([taskService.getTasksByDate(todayString()),taskRepository.countTodayStats(todayString())]);
      setTasks(rows);
      setCounts(stats);
      setError(null);
    } catch {
      setError("任务读取失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void useSettingsStore.getState().load();
    void load();
  }, [load, focusVersion]);

  const todayProgress = counts.total === 0 ? 0 : counts.completed / counts.total;

  const complete = async (id: number) => {
    try {
    await taskService.completeTask(id); // 经 Core Task Service（可撤销语义与主窗一致）
    await load();
    void invoke("notify_tasks_changed").catch(() => undefined);
    } catch { setError("未能完成任务，请重试。"); }
  };

  const addTask = async () => {
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      await taskService.createTask({ title });
      setDraft("");
      await load();
      void invoke("notify_tasks_changed").catch(() => undefined);
    } catch {
      setError("添加失败，输入已保留，请重试。");
    } finally {
      setAdding(false);
      inputRef.current?.focus();
    }
  };

  const backToMain = () => {
    void invoke("close_mini_window").catch(() => undefined);
  };

  return (
    <div className="flex h-screen flex-col bg-transparent text-text-primary">
      {error && <div role="alert" className="flex shrink-0 items-center gap-2 bg-danger-soft px-3 py-2 text-caption text-danger"><span className="flex-1">{error}</span><button type="button" onClick={() => void load()} className="underline">重新读取</button></div>}
      {/* 迷你标题条（可拖拽：data-tauri-drag-region） */}
      <div
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center justify-between border-b border-border-subtle bg-surface/70 px-2 select-none"
      >
        <button
          onClick={backToMain}
          aria-label="返回主窗口"
          title="返回主窗口"
          className="flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <ChevronLeft size={13} />
          主窗口
        </button>
        <span data-tauri-drag-region className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          今日 · {todayString()}
        </span>
        <button
          onClick={backToMain}
          aria-label="关闭迷你窗"
          title="关闭迷你窗"
          className="flex h-6 w-6 items-center justify-center rounded text-text-faint transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <X size={13} />
        </button>
      </div>

      {/* 快速添加 */}
      <div className="shrink-0 px-3 pt-2.5">
        <div className="glass-surface flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5">
          <Plus size={14} className="shrink-0 text-accent" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addTask();
            }}
            placeholder="快速添加今日任务…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-faint"
          />
        </div>
      </div>

      {/* 圆环卡：专注 + 今日进度 */}
      <div className="flex shrink-0 items-center justify-around gap-2 px-3 pt-3">
        <div className="min-w-0 w-[55%]"><FocusBridge notifications={false} /><FocusController mini /></div>

        {/* 今日进度 */}
        <div className="glass-surface flex w-[48%] flex-col items-center gap-1.5 rounded-xl border border-border-subtle px-2 py-3">
          <ProgressRing progress={todayProgress} size={92} stroke={7} color="var(--color-success)">
            <span className="text-lg font-semibold tabular-nums text-text-primary">
              {counts.completed}/{counts.total}
            </span>
            <span className="text-[10px] text-text-faint">今日完成</span>
          </ProgressRing>
          <span className="text-xs font-medium text-text-secondary">今日任务</span>
          <span className="text-[11px] text-text-faint">
            {counts.total === 0 ? "暂无执行任务" : `${Math.round(todayProgress * 100)}% 已完成`}
          </span>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {loading ? (
          <p className="py-6 text-center text-xs text-text-faint">加载中…</p>
        ) : tasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-faint">今天没有任务，输入上方快速添加</p>
        ) : (
          <ul className="space-y-1">
            {tasks.map((t) => {
              const pri = taskPriorityMeta(t.priority).label;
              const isDone = t.status === "COMPLETED";
              const time = timeLabel(t);
              return (
                <li
                  key={t.id}
                  className={`glass-surface flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5 ${
                    isDone ? "opacity-60" : ""
                  }`}
                >
                  <button
                    onClick={() => void complete(t.id)}
                    disabled={isDone}
                    aria-label={isDone ? `已完成：${t.title}` : `完成任务：${t.title}`}
                    title={isDone ? "已完成" : "完成任务"}
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isDone
                        ? "border-success bg-success text-white"
                        : "border-border-strong text-transparent hover:border-accent hover:text-accent"
                    }`}
                  >
                    <Check size={11} />
                  </button>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      isDone ? "text-text-faint line-through" : "text-text-primary"
                    }`}
                  >
                    {t.title}
                  </span>
                  {time && (
                    <span className="shrink-0 text-[11px] tabular-nums text-text-faint">{time}</span>
                  )}
                  <span
                    className={`shrink-0 rounded px-1 py-px text-[10px] ${
                      pri === "高"
                        ? "bg-red-50 text-red-600"
                        : pri === "中"
                          ? "bg-amber-50 text-amber-600"
                          : "bg-surface-muted text-text-faint"
                    }`}
                  >
                    {pri}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
