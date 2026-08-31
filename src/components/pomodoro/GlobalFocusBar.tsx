import { Timer, Pause, Play, Flag } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { formatTimer } from "../../lib/format";

/**
 * 全局 Focus 迷你条（右下角浮动）：Pomodoro 运行/休息时在所有页面可见，
 * 可暂停/继续/结束，点击「去专注」回到 Today 的 Focus Controller。未运行时隐藏。
 * 复用 pomodoroStore 单一状态，不做任何页面跳转外的逻辑。
 */
export default function GlobalFocusBar() {
  const setPage = useAppStore((s) => s.setPage);
  const taskId = usePomodoroStore((s) => s.taskId);
  const phase = usePomodoroStore((s) => s.phase);
  const snapshot = usePomodoroStore((s) => s.snapshot);
  const taskTitle = usePomodoroStore((s) => s.taskTitle);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const endFocus = usePomodoroStore((s) => s.endFocus);
  const tasks = useTaskStore((s) => s.tasks);

  // 未运行（含 IDLE / 已取消）→ 不显示
  if (snapshot.state === "IDLE" || snapshot.state === "CANCELLED") return null;

  const task = tasks.find((t) => t.id === taskId);
  const isBreak = phase !== "focus";
  const paused = snapshot.state === "PAUSED";
  const status = paused ? "已暂停" : isBreak ? "休息中" : "专注中";
  const title = isBreak
    ? phase === "long_break"
      ? "长休息"
      : "短休息"
    : (task?.title ?? taskTitle ?? "未选择任务");

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-md border border-neutral-200 bg-white p-2.5 shadow-lg">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
        <Timer size={14} />
      </span>
      <div className="min-w-0">
        <div className="max-w-[10rem] truncate text-sm font-medium text-neutral-900">
          {title}
        </div>
        <div className="text-xs tabular-nums text-neutral-500">
          {status} · {formatTimer(snapshot.remainingMs)}
        </div>
      </div>
      <button
        onClick={paused ? resume : pause}
        aria-label={paused ? "继续" : "暂停"}
        title={paused ? "继续" : "暂停"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100"
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button
        onClick={endFocus}
        aria-label="结束专注"
        title="结束专注"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100"
      >
        <Flag size={14} />
      </button>
      <button
        onClick={() => setPage("today")}
        className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
      >
        去专注
      </button>
    </div>
  );
}
