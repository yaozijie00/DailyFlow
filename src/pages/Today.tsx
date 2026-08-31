import { useEffect, useRef, useState } from "react";
import { Plus, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { todayString, weekdayLabel, formatDateLabel } from "../lib/date";
import { PageHeader } from "../components/ui/PageHeader";
import { IconButton } from "../components/ui/IconButton";
import { useWindowDrag } from "../hooks/useWindowDrag";
import TaskList from "../components/tasks/TaskList";
import QuickAddTask from "../components/tasks/QuickAddTask";
import TaskDetail from "../components/tasks/TaskDetail";
import TaskFormModal from "../components/tasks/TaskFormModal";
import Timeline from "../components/timeline/Timeline";
import TodaySummary from "../components/today/TodaySummary";
import TodayFestival from "../components/today/TodayFestival";
import TodayFocusController from "../components/pomodoro/TodayFocusController";
import CalendarPopover from "../components/today/CalendarPopover";

// 布局固定尺寸（与 className 保持一致）
const TASK_LIST_WIDTH = 256; // w-64
const DIVIDER_WIDTH = 12; // w-3
const TIMELINE_FLOOR = 240; // 时间轴保留的最小可用宽度
const DETAIL_MIN = 240;
const DETAIL_MAX = 640;
const DETAIL_DEFAULT = 320; // 原 w-80
const DETAIL_WIDTH_KEY = "dailyflow.detailWidth";

function readSavedWidth(): number {
  try {
    const n = Number(localStorage.getItem(DETAIL_WIDTH_KEY));
    if (Number.isFinite(n) && n >= DETAIL_MIN && n <= DETAIL_MAX) return n;
  } catch {
    /* ignore */
  }
  return DETAIL_DEFAULT;
}

export default function Today() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const load = useTaskStore((s) => s.load);
  const loading = useTaskStore((s) => s.loading);
  const openCreate = useTaskStore((s) => s.openCreate);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  const [showDetail, setShowDetail] = useState(true);
  const loadedDateRef = useRef(todayString());

  const containerRef = useRef<HTMLDivElement>(null);
  const [detailWidth, setDetailWidth] = useState<number>(readSavedWidth);
  const { start: startWindowDrag } = useWindowDrag();

  /** 详情面板允许的最大宽度：受绝对上限与「时间轴最小宽度」双重约束。 */
  function maxAllowedWidth(): number {
    const containerW = containerRef.current?.getBoundingClientRect().width ?? 10_000;
    return Math.min(
      DETAIL_MAX,
      containerW - TASK_LIST_WIDTH - DIVIDER_WIDTH - TIMELINE_FLOOR,
    );
  }

  /** 夹取宽度：常规下 [DETAIL_MIN, max]；窗口过小时优先保时间轴（压到 max）。 */
  function clampWidth(w: number): number {
    const max = maxAllowedWidth();
    const lo = Math.min(DETAIL_MIN, max);
    return Math.min(Math.max(w, lo), max);
  }

  function saveWidth(w: number): void {
    try {
      localStorage.setItem(DETAIL_WIDTH_KEY, String(w));
    } catch {
      /* ignore */
    }
  }

  // 窗口缩放时夹取宽度，避免横向溢出 / 时间轴被挤没
  useEffect(() => {
    const onResize = () => setDetailWidth((w) => clampWidth(w));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中任务时自动展开右侧详情
  useEffect(() => {
    if (selectedTaskId != null) setShowDetail(true);
  }, [selectedTaskId]);

  useEffect(() => {
    if (dbStatus === "ready") {
      load();
      loadedDateRef.current = todayString();
    }
  }, [load, dbStatus]);

  // 跨午夜自动刷新：停留在「今天」时跳到新的一天；查看历史日期则不动
  useEffect(() => {
    const id = window.setInterval(() => {
      const today = todayString();
      if (today === loadedDateRef.current) return;
      const wasOnToday = useTaskStore.getState().selectedDate === loadedDateRef.current;
      loadedDateRef.current = today;
      if (wasOnToday) {
        useTaskStore.getState().goToToday();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  function startResize(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = detailWidth;
    startWindowDrag(
      {
        onMove: (ev) => {
          // 向左拖 = 详情更宽
          setDetailWidth(clampWidth(startWidth - (ev.clientX - startX)));
        },
        onUp: (ev) => {
          const w = clampWidth(startWidth - (ev.clientX - startX));
          setDetailWidth(w);
          saveWidth(w);
        },
      },
      () => {
        /* 拖拽被中断（失焦/ESC）：无需额外清理 */
      },
    );
  }

  function resetWidth() {
    const w = clampWidth(DETAIL_DEFAULT);
    setDetailWidth(w);
    saveWidth(w);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={
          <CalendarPopover
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            label={
              selectedDate === todayString() ? "今日" : formatDateLabel(selectedDate)
            }
          />
        }
        description={
          selectedDate === todayString()
            ? `${selectedDate} · ${weekdayLabel()}`
            : selectedDate
        }
        actions={
          <IconButton
            label={showDetail ? "隐藏详情" : "显示详情"}
            onClick={() => setShowDetail((v) => !v)}
          >
            {showDetail ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </IconButton>
        }
      />

      {/* 今日信息行：左侧 节日 + 统计（左对齐，与时间轴窗口左缘一致） */}
      <div className="flex items-center gap-4">
        <TodayFestival date={selectedDate} />
        <TodaySummary />
      </div>

      {/* 全局 Focus Controller（复用 pomodoroStore 单一状态） */}
      <TodayFocusController />

      <div className="flex min-h-0 flex-1" ref={containerRef}>
        {/* 左：任务列表 */}
        <aside className="w-64 shrink-0 overflow-y-auto pr-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-600">今日任务</h2>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700"
            >
              <Plus size={14} /> 新建
            </button>
          </div>
          <QuickAddTask />
          {loading ? (
            <div className="text-sm text-neutral-400">加载中…</div>
          ) : (
            <TaskList />
          )}
        </aside>

        {/* 中：时间轴（自身负责滚动） */}
        <main className="min-w-0 min-h-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <Timeline />
        </main>

        {/* 分隔线 + 右：任务详情（可折叠 / 可拖动调宽） */}
        {showDetail && (
          <>
            <div
              onMouseDown={startResize}
              onDoubleClick={resetWidth}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整详情宽度"
              title="拖动调整宽度，双击恢复默认"
              className="group flex w-3 shrink-0 cursor-col-resize items-center justify-center"
            >
              <div className="h-full w-px bg-neutral-200 transition-colors group-hover:bg-neutral-400" />
            </div>
            <aside style={{ width: detailWidth }} className="shrink-0 overflow-y-auto">
              <TaskDetail />
            </aside>
          </>
        )}
      </div>

      <TaskFormModal />
    </div>
  );
}
