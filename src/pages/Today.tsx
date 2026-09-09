import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Plus, PanelRightClose, PanelRightOpen, Inbox } from "lucide-react";
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
import ReminderRail, { REMINDER_RAIL_WIDTH } from "../components/today/ReminderRail";
import { useEnabledSlotComponents, ExtensionErrorBoundary } from "../extensions/host";
import { computeReminderSummary, hasAnyReminder } from "../lib/dayWarnings";
import NoteList from "../components/notes/NoteList";
import CalendarPopover from "../components/today/CalendarPopover";
import { useNoteStore } from "../stores/noteStore";
import { shouldOverlayTodayDetail } from "../lib/layoutBreakpoints";

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
  const notes = useNoteStore((s) => s.notes);
  const loadNotes = useNoteStore((s) => s.load);
  const tasks = useTaskStore((s) => s.tasks);
  const overdue = useTaskStore((s) => s.overdue);
  const load = useTaskStore((s) => s.load);
  const loading = useTaskStore((s) => s.loading);
  const openCreate = useTaskStore((s) => s.openCreate);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const detailOpenSeq = useTaskStore((s) => s.detailOpenSeq);
  const selectedDate = useTaskStore((s) => s.selectedDate);
  const setSelectedDate = useTaskStore((s) => s.setSelectedDate);
  // 详情按需展开，把首屏宽度优先留给任务与时间轴。
  const [showDetail, setShowDetail] = useState(false);
  const [showInbox, setShowInbox] = useState(settings.todayShowNotes);
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
  const todaySlotComponents = useEnabledSlotComponents("today");
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

  // 详情面板展示模式（R3 响应式）：容器 <1180 时详情改浮层（不占常驻列），
  // 保时间轴与任务列表为主要可视区；次级面板（详情/提醒）此时一律按需（浮层/页头入口）。
  const [detailOverlay, setDetailOverlay] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const overlay = shouldOverlayTodayDetail(el.clientWidth);
      setDetailOverlay(overlay);
      // 浮层模式：提醒不横排占列（走页头铃铛入口浮层）；
      // 横排模式：仅当详情未开且空间不足（挤到时间轴下限）时收提醒
      if (overlay) {
        setRailNarrow(true);
      } else {
        const overhead = showRail && !showDetail ? REMINDER_RAIL_WIDTH : 0;
        setRailNarrow(
          showRail &&
            !showDetail &&
            el.clientWidth < TASK_LIST_WIDTH + overhead + TIMELINE_FLOOR + 24,
        );
      }
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

  // 点击任务（含重复点击同一任务）→ 必然展开详情面板。
  // 依赖 detailOpenSeq（单调递增）：selectTask 相同 id 值不变不会触发订阅，
  // 而 openTaskDetail 每次都 +1 → 任何一次任务点击都会走这里把详情打开。
  useEffect(() => {
    if (selectedTaskId != null) setShowDetail(true);
  }, [detailOpenSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // 浮层模式（空间过窄）下首次进入时若详情处于「横排常驻」残留 → 自动收起为按需；
  // 之后（用户点任务/点页头按钮）不再自动收，避免「点开瞬间被收回」导致看似打不开。
  const overlayEntryRef = useRef(detailOverlay);
  useEffect(() => {
    const enteredOverlay = detailOverlay && !overlayEntryRef.current;
    overlayEntryRef.current = detailOverlay;
    if (enteredOverlay && showDetail && selectedTaskId == null) {
      setShowDetail(false);
    }
    // 仅关注「进入浮层模式」这一瞬；之后 showDetail 完全由用户操作控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOverlay]);

  // 选中被清除（详情内延期/删除 → selectTask(null)）→ 浮层模式下的详情随之收起，
  // 不留空占位浮层；宽容器横排右列保持旧行为（显示空态占位提示）。
  const prevSelectedRef = useRef(selectedTaskId);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedTaskId;
    if (detailOverlay && prev != null && selectedTaskId == null && showDetail) {
      setShowDetail(false);
    }
  }, [detailOverlay, selectedTaskId, showDetail]);

  useEffect(() => {
    if (dbStatus === "ready") {
      load();
      void loadNotes();
      loadedDateRef.current = todayString();
    }
  }, [load, loadNotes, dbStatus]);

  useEffect(() => {
    setShowInbox(settings.todayShowNotes);
  }, [settings.todayShowNotes]);

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
            <button
              onClick={() => setShowInbox((value) => !value)}
              aria-expanded={showInbox}
              aria-controls="today-inbox"
              className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                showInbox
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : "border-border-subtle bg-surface text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <Inbox size={15} />
              收集箱
              <span className="rounded-full bg-surface-muted px-1.5 tabular-nums text-text-muted">
                {notes.filter((note) => note.status === "active").length}
              </span>
            </button>
            {showRail && railNarrow && (
              <button
                onClick={() => setRailOpen((v) => !v)}
                aria-label="今日提醒（点击展开）"
                title="今日提醒"
                className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-surface text-text-secondary transition-colors hover:bg-surface-hover"
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
        <div className="fixed right-3 top-[4.5rem] z-[90] w-[270px] max-h-[70vh] overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated p-2 shadow-popover">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-text-secondary">今日提醒</span>
            <button
              onClick={() => setRailOpen(false)}
              aria-label="关闭提醒"
              className="rounded p-0.5 text-text-faint hover:bg-surface-hover"
            >
              ×
            </button>
          </div>
          <ReminderRail />
        </div>
      )}

      {/* 今日信息行：左侧 节日 + 统计（左对齐，与时间轴窗口左缘一致） */}
      <div className="flex flex-wrap items-center gap-3">
        <TodayFestival date={selectedDate} />
        <TodaySummary />
      </div>

      {/* 今日扩展槽位（如课程表「今日课程」；仅查看今天时显示，由 Extension 决定内容）。
          Rule 04：每个槽位组件独立包错误边界——单个扩展渲染异常只替换该区块，不崩 Today 页。 */}
      {selectedDate === todayString() &&
        todaySlotComponents.map(({ id, Component }) => (
          <ExtensionErrorBoundary key={id} label={id}>
            <Component />
          </ExtensionErrorBoundary>
        ))}

      {/* 主区：任务 | 时间轴 | 右列（详情/提醒；窄窗详情=浮层不占宽，次级面板按需） */}
      <div className="relative flex min-h-0 flex-1" ref={containerRef}>
        {/* 左：任务列表 + 便签（持久区域；窄窗略收窄让时间轴更宽） */}
        <aside
          className={`flex shrink-0 flex-col pr-4 transition-[width] duration-200 ${
            detailOverlay ? "w-64" : "w-72"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary">今日任务</h2>
              <button
                onClick={() => openCreate()}
                className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-on-accent hover:bg-accent-hover"
              >
                <Plus size={14} /> 新建
              </button>
            </div>
            <QuickAddTask />
            {loading ? (
              <div className="text-sm text-text-faint">加载中…</div>
            ) : (
              <TaskList />
            )}
          </div>
          {/* 便签区：固定高度、独立滚动（可在设置中隐藏；次级面板窄窗自动收缩高度） */}
          {showInbox && (
            <div
              id="today-inbox"
              className={`shrink-0 overflow-y-auto pt-1 transition-[max-height] duration-200 ${
                detailOverlay ? "max-h-32" : "max-h-44"
              }`}
            >
              <NoteList />
            </div>
          )}
        </aside>

        {/* 右半区（时间轴 + 浮层/右列）：浮层只覆盖此区，不盖左栏（左栏保持可点选任务） */}
        <div className="relative flex min-w-0 min-h-0 flex-1">
          {/* 中：时间轴（自身负责滚动；详情浮层模式时间轴保持全宽） */}
          <main className="min-w-0 min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle glass-surface">
            <Timeline />
          </main>

          {/* 右列（宽容器横排模式）：提醒卡 + 详情面板 共用一列 */}
          {!detailOverlay && (showDetail || (showRail && !railNarrow)) && (
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
                  <div className="h-full w-px bg-border-subtle transition-colors group-hover:bg-border-strong" />
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

          {/* 详情浮层（窄容器模式）：覆盖时间轴右侧，不占列宽也不盖左栏 */}
          {detailOverlay && showDetail && (
            <>
              <div
                className="absolute inset-0 z-20 bg-black/10"
                onClick={() => {
                  setShowDetail(false);
                  useTaskStore.getState().selectTask(null);
                }}
              />
              <div className="glass-surface absolute inset-y-0 right-0 z-30 flex w-[min(380px,86%)] flex-col border-l border-border-subtle shadow-popover">
                <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
                  <span className="text-xs font-medium text-text-secondary">任务详情</span>
                  <button
                    onClick={() => {
                      setShowDetail(false);
                      useTaskStore.getState().selectTask(null);
                    }}
                    aria-label="关闭详情"
                    title="关闭详情"
                    className="rounded p-0.5 text-text-faint hover:bg-surface-hover hover:text-text-primary"
                  >
                    ×
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <TaskDetail />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <TaskFormModal />
    </div>
  );
}
