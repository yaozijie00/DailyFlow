import { useEffect, useRef, useState } from "react";
import { Timer, Pause, Play, Flag, GripHorizontal } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { formatTimer } from "../../lib/format";

/**
 * 全局 Focus 迷你条（浮动）：Pomodoro 运行/休息时在所有页面可见，
 * 可暂停/继续/结束；点击主体（任务名/倒计时）跳到「专注」页。
 * 未运行（IDLE / CANCELLED / COMPLETED）时隐藏。
 * 默认右下角；按住左侧手柄可拖动避让（不遮挡任务详情等主要内容）。
 * 自带每秒刷新（不依赖专注页），保证切到任意页面倒计时仍走动。
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
  const refresh = usePomodoroStore((s) => s.refresh);
  const tasks = useTaskStore((s) => s.tasks);
  const { start: startWindowDrag } = useWindowDrag();
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // 每秒刷新引擎快照（只负责显示，不参与计时）：切到任意页面倒计时保持走动
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // 未运行（IDLE / 已取消 / 已完成）→ 不显示（会话结束，悬浮条无需再控制）
  if (
    snapshot.state === "IDLE" ||
    snapshot.state === "CANCELLED" ||
    snapshot.state === "COMPLETED"
  ) {
    return null;
  }

  const task = tasks.find((t) => t.id === taskId);
  const isBreak = phase !== "focus";
  const paused = snapshot.state === "PAUSED";
  const status = paused ? "已暂停" : isBreak ? "休息中" : "专注中";
  const title = isBreak
    ? phase === "long_break"
      ? "长休息"
      : "短休息"
    : (task?.title ?? taskTitle ?? "未选择任务");

  const goFocus = () => setPage("focus"); // 点击主体/去专注 → 跳转「专注」页（保留计时状态）

  /** 拖动悬浮条避让（手柄 mousedown → 跟随指针，夹取到视口内）。 */
  function startDrag(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const rect = barRef.current!.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const bw = rect.width;
    const bh = rect.height;
    startWindowDrag(
      {
        onMove: (ev) => {
          const x = Math.min(Math.max(0, ev.clientX - offsetX), window.innerWidth - bw);
          const y = Math.min(Math.max(0, ev.clientY - offsetY), window.innerHeight - bh);
          setPos({ x, y });
        },
        onUp: () => {
          /* 松开即停在当前位置 */
        },
      },
      () => {
        /* 中断（失焦/ESC）无需额外处理 */
      },
    );
  }

  return (
    <div
      ref={barRef}
      className="fixed z-40 flex items-center gap-2.5 rounded-md border border-line bg-surface p-2.5 shadow-lg"
      style={pos != null ? { left: pos.x, top: pos.y } : { bottom: "1rem", right: "1rem" }}
    >
      <span
        onMouseDown={startDrag}
        title="拖动调整位置"
        aria-label="拖动悬浮窗"
        className="shrink-0 cursor-grab text-ink-3 hover:text-ink-2 active:cursor-grabbing"
      >
        <GripHorizontal size={14} />
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
        <Timer size={14} />
      </span>
      <button
        onClick={goFocus}
        title="打开专注页面"
        className="min-w-0 cursor-pointer text-left"
      >
        <div className="max-w-[10rem] truncate text-sm font-medium text-ink">
          {title}
        </div>
        <div className="text-xs tabular-nums text-ink-2">
          {status} · {formatTimer(snapshot.remainingMs)}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (paused) resume();
          else pause();
        }}
        aria-label={paused ? "继续" : "暂停"}
        title={paused ? "继续" : "暂停"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink transition-colors hover:bg-canvas"
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          endFocus();
        }}
        aria-label="结束专注"
        title="结束专注"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink transition-colors hover:bg-canvas"
      >
        <Flag size={14} />
      </button>
      <button
        onClick={goFocus}
        className="shrink-0 rounded-md border border-line-strong px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-canvas"
      >
        去专注
      </button>
    </div>
  );
}
