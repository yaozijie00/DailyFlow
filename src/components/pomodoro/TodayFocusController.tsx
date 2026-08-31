import { Timer, Pause, Play, Flag } from "lucide-react";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatTimer } from "../../lib/format";

/**
 * Today 页的紧凑 Focus 状态条（复用 pomodoroStore 单一状态）：
 * 只做「查看 / 暂停 / 继续 / 结束」，不承担任务选择——
 * 开始专注请到「专注」页选择任务。未运行时完全隐藏，不占空间。
 */
export default function TodayFocusController() {
  const taskId = usePomodoroStore((s) => s.taskId);
  const phase = usePomodoroStore((s) => s.phase);
  const completedFocusCount = usePomodoroStore((s) => s.completedFocusCount);
  const snapshot = usePomodoroStore((s) => s.snapshot);
  const taskTitle = usePomodoroStore((s) => s.taskTitle);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const endFocus = usePomodoroStore((s) => s.endFocus);

  const tasks = useTaskStore((s) => s.tasks);
  const longBreakInterval = useSettingsStore((s) => s.settings.longBreakInterval);

  // 未运行 → 不显示（任务选择在「专注」页）
  if (snapshot.state === "IDLE" || snapshot.state === "CANCELLED") return null;

  const task = tasks.find((t) => t.id === taskId);
  const isBreak = phase !== "focus";
  const paused = snapshot.state === "PAUSED";
  const status =
    snapshot.state === "PAUSED"
      ? "已暂停"
      : snapshot.state === "COMPLETED"
        ? isBreak
          ? "休息结束"
          : "专注完成"
        : isBreak
          ? "休息中"
          : "专注中";
  const title = isBreak
    ? phase === "long_break"
      ? "长休息"
      : "短休息"
    : (task?.title ?? taskTitle ?? "未选择任务");

  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
        <Timer size={12} />
      </span>
      <span className="max-w-[12rem] truncate font-medium text-neutral-900">{title}</span>
      <span className="shrink-0 text-xs text-neutral-500">{status}</span>
      <span className="shrink-0 text-lg font-semibold tabular-nums text-neutral-900">
        {formatTimer(snapshot.remainingMs)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-neutral-400">
        {completedFocusCount}/{longBreakInterval}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          onClick={paused ? resume : pause}
          aria-label={paused ? "继续" : "暂停"}
          title={paused ? "继续" : "暂停"}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          onClick={endFocus}
          aria-label="结束专注"
          title="结束专注"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <Flag size={13} />
        </button>
      </div>
    </div>
  );
}
