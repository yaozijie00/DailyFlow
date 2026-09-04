import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Plus, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useSettingsStore } from "../stores/settingsStore";
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
import TodayCourses from "../components/today/TodayCourses";
import ReminderRail, { REMINDER_RAIL_WIDTH } from "../components/today/ReminderRail";
import { computeReminderSummary, hasAnyReminder } from "../lib/dayWarnings";
import NoteList from "../components/notes/NoteList";
import CalendarPopover from "../components/today/CalendarPopover";

// 布局固定尺寸（与 className 保持一致）
const TASK_LIST_WIDTH = 288; // w-72（含右侧 pr-4 间距，取整避免时间轴过挤）
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
  const settings = useSettingsStore((s) => s.settings);
  const tasks = useTaskStore((s) => s.tasks);
  const overdue = useTaskStore((s) => s.overdue);
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

  // 提醒摘要：提醒卡与详情面板共用右侧一列（详情开时不额外占宽）
  const reminderSummary = useMemo(
    () => computeReminderSummary(tasks, overdue.length),
    [tasks, overdue],
  );
  const showRail = hasAnyReminder(reminderSummary);
  const [railNarrow, setRailNarrow] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  /** 详情面板允许的最大宽度：受绝对上限与「时间轴最小宽度」双重约束。 */
  function maxAllowedWidth(): number {
    const containerW = containerRef.current?.getBoundingClientRect().width ?? 10_000;
    // 仅当详情未开、提醒卡单独占右列时让出 260px；详情打开时提醒在详情列内，不额外占宽
    const railOverhead = showRail && !showDetail && !railNarrow ? REMINDER_RAIL_WIDTH : 0;
    return Math.min(
      DETAIL_MAX,
      containerW - TASK_LIST_WIDTH - DIVIDER_WIDTH - TIMELINE_FLOOR - railOverhead,
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

  // 空间不足（详情未开、提醒卡单独占列会挤到 Timeline 最小宽度）时：
  // 不整条横排、不压缩时间轴 → 提醒改为页头右上角入口，点开展浮层。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const overhead = showRail && !showDetail ? REMINDER_RAIL_WIDTH : 0;
      setRailNarrow(
        showRail &&
          !showDetail &&
          el.clientWidth < TASK_LIST_WIDTH + overhead + TIMELINE_FLOOR + 24,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showRail, showDetail, detailWidth]);

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

  // 查看「今天」时加载昨日未完成（逾期结转横幅）；切到历史日期则清空
  useEffect(() => {
    if (dbStatus === "ready") {
      void useTaskStore.getState().loadOverdue();
    }
  }, [dbStatus, selectedDate]);

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
    <div className="flex h-full flex-col gap-5">
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
          <>
            {showRail && railNarrow && (
              <button
                onClick={() => setRailOpen((v) => !v)}
                aria-label="今日提醒（点击展开）"
                title="今日提醒"
                className="relative flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                <Bell size={15} />
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold leading-none text-white">
                  {reminderSummary.overdueCount +
                    reminderSummary.conflicts.length +
                    (reminderSummary.overload > 0 ? 1 : 0)}
                </span>
              </button>
            )}
            <IconButton
              label={showDetail ? "隐藏详情" : "显示详情"}
              onClick={() => setShowDetail((v) => !v)}
            >
              {showDetail ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </IconButton>
          </>
        }
      />

      {/* 窄屏时点开提醒：浮层（不整条横排、不挤压时间轴） */}
      {showRail && railNarrow && railOpen && (
        <div className="fixed inset-0 z-[85]" onClick={() => setRailOpen(false)} />
      )}
      {showRail && railNarrow && railOpen && (
        <div className="fixed right-3 top-[4.5rem] z-[90] w-[270px] max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-xl">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-neutral-600">今日提醒</span>
            <button
              onClick={() => setRailOpen(false)}
              aria-label="关闭提醒"
              className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100"
            >
              ×
            </button>
          </div>
          <ReminderRail />
        </div>
      )}

      {/* 今日信息行：左侧 节日 + 统计（左对齐，与时间轴窗口左缘一致） */}
      <div className="flex items-center gap-4">
        <TodayFestival date={selectedDate} />
        <TodaySummary />
      </div>

      {/* 今日课程（课程表 → Today，仅查看「今天」时显示） */}
      {selectedDate === todayString() && <TodayCourses />}

      {/* 主区：任务 | 时间轴 | 右列（提醒卡在详情面板上方；二者都不占用 Timeline 纵向空间） */}
      <div className="flex min-h-0 flex-1" ref={containerRef}>
        {/* 左：任务列表 + 便签（持久区域） */}
        <aside className="flex w-72 shrink-0 flex-col pr-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
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
          </div>
          {/* 便签区：固定高度、独立滚动（可在设置中隐藏） */}
          {settings.todayShowNotes && (
            <div className="max-h-44 shrink-0 overflow-y-auto pt-1">
              <NoteList />
            </div>
          )}
        </aside>

        {/* 中：时间轴（自身负责滚动） */}
        <main className="min-w-0 min-h-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <Timeline />
        </main>

        {/* 右列：提醒卡（详情面板正上方）+ 详情面板（共用一列，提醒出现/消失不影响 Timeline） */}
        {(showDetail || (showRail && !railNarrow)) && (
          <>
            {showDetail && (
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
            )}
            <div
              className="flex min-h-0 shrink-0 flex-col"
              style={{ width: showDetail ? detailWidth : REMINDER_RAIL_WIDTH }}
            >
              {showRail && !railNarrow && (
                <div className="max-h-[45%] shrink-0 overflow-y-auto pb-2">
                  <ReminderRail />
                </div>
              )}
              {showDetail && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <TaskDetail />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <TaskFormModal />
    </div>
  );
}
