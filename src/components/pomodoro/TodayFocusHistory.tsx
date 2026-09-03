import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { usePomodoroStore, defaultFocusService } from "../../stores/pomodoroStore";
import type { FocusSessionDetail } from "../../db/repositories/focusSessionRepository";
import { Dialog } from "../ui/Dialog";
import { formatDuration } from "../../lib/format";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationText(seconds: number): string {
  return formatDuration(seconds) || `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

/**
 * 专注页「今日专注」历史（v1.6.2）：
 * - 列出今天开始的真实 Focus Session（时间、任务、时长），点击查看详情；
 * - focusVersion 变化（会话落库）时自动刷新。
 */
export default function TodayFocusHistory() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const focusVersion = usePomodoroStore((s) => s.focusVersion);
  const [sessions, setSessions] = useState<FocusSessionDetail[] | null>(null);
  const [detail, setDetail] = useState<FocusSessionDetail | null>(null);

  useEffect(() => {
    if (useAppStore.getState().dbStatus !== "ready") return;
    let alive = true;
    void defaultFocusService
      .getTodaySessions()
      .then((rows) => {
        if (alive) setSessions(rows);
      })
      .catch(() => {
        if (alive) setSessions([]);
      });
    return () => {
      alive = false;
    };
  }, [dbStatus, focusVersion]);

  return (
    <section className="mt-6 rounded-md border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-800">
        <History size={15} className="text-neutral-400" />
        今日专注
        <span className="text-xs font-normal text-neutral-400">
          {sessions ? `共 ${sessions.length} 次` : ""}
        </span>
      </div>

      {sessions === null ? (
        <div className="text-xs text-neutral-400">加载中…</div>
      ) : sessions.length === 0 ? (
        <div className="py-3 text-center text-xs text-neutral-400">
          今天还没有专注记录。开始一次专注，这里会显示真实记录的时间。
        </div>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setDetail(s)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-neutral-50"
              >
                <span className="shrink-0 tabular-nums text-neutral-500">
                  {clock(s.startedAt)} - {s.endedAt ? clock(s.endedAt) : "进行中"}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-800">{s.taskTitle}</span>
                {s.endedAt == null && (
                  <span className="shrink-0 text-amber-600">专注中…</span>
                )}
                <span className="shrink-0 tabular-nums text-neutral-500">
                  {durationText(s.actualDuration)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={detail != null} onClose={() => setDetail(null)} title="专注详情">
        {detail && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">任务</span>
              <span className="text-neutral-900">{detail.taskTitle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">分类</span>
              <span className="text-neutral-900">{detail.categoryName ?? "未分类"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">开始</span>
              <span className="tabular-nums text-neutral-900">
                {new Date(detail.startedAt).toLocaleString("zh-CN", { hour12: false })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">结束</span>
              <span className="tabular-nums text-neutral-900">
                {detail.endedAt
                  ? new Date(detail.endedAt).toLocaleString("zh-CN", { hour12: false })
                  : "进行中"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">实际时长</span>
              <span className="tabular-nums text-neutral-900">{durationText(detail.actualDuration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">计划时长</span>
              <span className="tabular-nums text-neutral-900">{durationText(detail.plannedDuration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">结果</span>
              <span className={detail.completed ? "text-green-600" : "text-neutral-900"}>
                {detail.completed ? "✓ 走满完成" : detail.endedAt ? "提前结束" : "进行中"}
              </span>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
