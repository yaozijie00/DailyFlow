import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { todayString } from "../lib/date";
import TaskList from "../components/tasks/TaskList";
import TaskDetail from "../components/tasks/TaskDetail";
import TaskFormModal from "../components/tasks/TaskFormModal";
import Timeline from "../components/timeline/Timeline";
import TodaySummary from "../components/today/TodaySummary";

export default function Today() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const load = useTaskStore((s) => s.load);
  const loading = useTaskStore((s) => s.loading);
  const openCreate = useTaskStore((s) => s.openCreate);
  const loadedDateRef = useRef(todayString());

  useEffect(() => {
    if (dbStatus === "ready") {
      load();
      loadedDateRef.current = todayString();
    }
  }, [load, dbStatus]);

  // 跨午夜自动刷新今日任务（B10）
  useEffect(() => {
    const id = window.setInterval(() => {
      const today = todayString();
      if (today !== loadedDateRef.current) {
        loadedDateRef.current = today;
        load();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="text-sm text-neutral-500">{todayString()}</p>
      </header>

      <div className="flex gap-4">
        {/* 左：任务列表 */}
        <aside className="w-64 shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-600">今日任务</h2>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700"
            >
              <Plus size={14} /> 新建
            </button>
          </div>
          {loading ? (
            <div className="text-sm text-neutral-400">加载中…</div>
          ) : (
            <TaskList />
          )}
        </aside>

        {/* 中：时间轴 */}
        <main className="min-w-0 flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-white">
          <Timeline />
        </main>

        {/* 右：任务详情 */}
        <aside className="w-80 shrink-0">
          <TaskDetail />
        </aside>
      </div>

      {/* 底部：今日摘要（实时统计） */}
      <TodaySummary />

      <TaskFormModal />
    </div>
  );
}
