import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, CheckCircle2, Flag } from "lucide-react";
import { usePomodoroStore } from "../../stores/pomodoroStore";
import { useTaskStore } from "../../stores/taskStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatTimer, formatDuration } from "../../lib/format";

const STATE_LABEL: Record<string, string> = {
  IDLE: "未开始",
  RUNNING: "专注中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

/** 专注页的番茄钟面板：任务选择 → 计时 → 结果。不含动画/音效/成就。 */
export default function PomodoroPanel() {
  const taskId = usePomodoroStore((s) => s.taskId);
  const snapshot = usePomodoroStore((s) => s.snapshot);
  const showResult = usePomodoroStore((s) => s.showResult);
  const restoredTaskTitle = usePomodoroStore((s) => s.taskTitle);
  const startFocus = usePomodoroStore((s) => s.startFocus);
  const pause = usePomodoroStore((s) => s.pause);
  const resume = usePomodoroStore((s) => s.resume);
  const endFocus = usePomodoroStore((s) => s.endFocus);
  const continueFocus = usePomodoroStore((s) => s.continueFocus);
  const refresh = usePomodoroStore((s) => s.refresh);
  const reset = usePomodoroStore((s) => s.reset);

  const tasks = useTaskStore((s) => s.tasks);
  const completeTask = useTaskStore((s) => s.completeTask);
  const pomodoroDurationMinutes = useSettingsStore(
    (s) => s.settings.pomodoroDurationMinutes,
  );

  const [selectedId, setSelectedId] = useState("");

  // UI 每秒轮询一次引擎快照（只负责显示刷新，不参与计时）
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const selectableTasks = tasks.filter(
    (t) => t.status === "TODO" || t.status === "IN_PROGRESS"
  );
  const task = tasks.find((t) => t.id === taskId);
  const progressPercent = Math.round(snapshot.progress * 100);

  const handleFinishTask = async () => {
    if (taskId == null) return;
    await completeTask(taskId);
    reset();
    setSelectedId("");
  };

  return (
    <div className="max-w-md rounded-md border border-neutral-200 bg-white p-6">
      {/* 任务名称 */}
      <div className="mb-4">
        <div className="text-xs text-neutral-500">专注任务</div>
        {snapshot.state === "IDLE" ? (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">请选择任务</option>
            {selectableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-1 truncate text-base font-medium text-neutral-900">
            {task?.title ?? restoredTaskTitle ?? "未选择任务"}
          </div>
        )}
      </div>

      {/* 结果视图：本次专注时间 + 完成任务 / 继续专注 */}
      {showResult ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 size={20} />
            <span className="text-lg font-semibold">专注完成</span>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">本次专注</dt>
              <dd className="font-medium text-neutral-900">
                {formatDuration(Math.round(snapshot.elapsedMs / 1000)) || "0分钟"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">任务</dt>
              <dd className="max-w-[16rem] truncate text-neutral-900">
                {task?.title ?? restoredTaskTitle ?? "未选择任务"}
              </dd>
            </div>
          </dl>
          <div className="flex gap-2">
            <button
              onClick={handleFinishTask}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-500"
            >
              <Flag size={14} /> 完成任务
            </button>
            <button
              onClick={continueFocus}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
            >
              <RotateCcw size={14} /> 继续专注
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 剩余时间 + 进度 + 状态 */}
          <div className="mb-2 text-center">
            <div className="text-5xl font-semibold tabular-nums text-neutral-900">
              {formatTimer(snapshot.remainingMs)}
            </div>
            <div className="mt-1 text-sm text-neutral-500">
              {STATE_LABEL[snapshot.state] ?? snapshot.state}
            </div>
          </div>

          <div className="mb-1 h-2 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full bg-neutral-900"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mb-4 text-right text-xs text-neutral-500">
            进度 {progressPercent}%
          </div>

          {/* 按钮 */}
          <div className="flex gap-2">
            {snapshot.state === "IDLE" && (
              <button
                disabled={!selectedId || selectableTasks.length === 0}
                onClick={() =>
                  startFocus(Number(selectedId), pomodoroDurationMinutes * 60_000)
                }
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                <Play size={14} /> 开始（{pomodoroDurationMinutes} 分钟）
              </button>
            )}
            {snapshot.state === "RUNNING" && (
              <>
                <button
                  onClick={pause}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
                >
                  <Pause size={14} /> 暂停
                </button>
                <button
                  onClick={endFocus}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  <Flag size={14} /> 结束
                </button>
              </>
            )}
            {snapshot.state === "PAUSED" && (
              <>
                <button
                  onClick={resume}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
                >
                  <Play size={14} /> 继续
                </button>
                <button
                  onClick={endFocus}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  <Flag size={14} /> 结束
                </button>
              </>
            )}
          </div>

          {snapshot.state === "IDLE" && selectableTasks.length === 0 && (
            <p className="mt-3 text-xs text-neutral-400">
              今日暂无待办任务，请先到「今日」页创建任务。
            </p>
          )}
        </>
      )}
    </div>
  );
}
