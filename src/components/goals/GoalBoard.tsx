import { useEffect, useState } from "react";
import { CalendarRange, Check, FolderKanban, Pencil, Plus, Timer, X } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useTaskStore } from "../../stores/taskStore";
import { useProjectStore } from "../../stores/projectStore";
import { formatDurationCompact } from "../../lib/format";
import { goalColor } from "../../lib/goalColors";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";

interface GoalBoardProps {
  goals: GoalWithProgress[];
  onEdit: (goal: GoalWithProgress) => void;
  onComplete: (goal: GoalWithProgress) => void;
  onOpenProject?: (projectId: number) => void;
}

/**
 * 长期页「看板」视图（V3.1 重建）：进行中目标 = 卡片网格。
 * 每卡：左侧色条 + 标题 + 优先级 + 日期 + 进度环 + 关联任务/专注 + 项目 chips（行内添加/删除）。
 * 卡片布局吸收原 ProjectManager 能力，信息密度与可扫读性优先。
 */
export default function GoalBoard({ goals, onEdit, onComplete, onOpenProject }: GoalBoardProps) {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const projects = useProjectStore((s) => s.projects);
  const create = useProjectStore((s) => s.create);
  const remove = useProjectStore((s) => s.remove);
  const projectSummary = useTaskStore((s) => s.projectSummary);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (dbStatus === "ready") {
      void useProjectStore.getState().load();
      void useTaskStore.getState().loadProjectSummary();
    }
  }, [dbStatus]);

  const addProject = async (goalId: number) => {
    const t = (drafts[goalId] ?? "").trim();
    if (!t) return;
    const ok = await create(goalId, t);
    if (ok) {
      setDrafts((d) => ({ ...d, [goalId]: "" }));
      void useTaskStore.getState().loadProjectSummary();
    }
  };

  if (goals.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-strong p-8 text-center text-sm text-text-faint">
        还没有进行中的长期任务——点右上角「新建」开始规划一个方向。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {goals.map((g) => {
        const list = projects.filter((p) => p.goalId === g.id);
        const color = goalColor(g.id);
        const pri =
          g.priority === "high" ? "高" : g.priority === "low" ? "低" : "中";
        return (
          <div
            key={g.id}
            className="glass-surface relative flex flex-col overflow-hidden rounded-md border border-border-subtle"
          >
            {/* 左侧色条 */}
            <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 pl-4">
              {/* 标题行：标题 + 优先级 + 操作 */}
              <div className="flex items-start gap-1.5">
                <button
                  onClick={() => onEdit(g)}
                  title="编辑长期任务"
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-text-primary hover:text-accent"
                >
                  {g.title}
                </button>
                <span
                  className={`mt-0.5 shrink-0 rounded px-1 py-px text-[10px] leading-tight ${
                    g.priority === "high"
                      ? "bg-red-50 text-red-600"
                      : g.priority === "low"
                        ? "bg-surface-muted text-text-muted"
                        : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {pri}
                </span>
                <button
                  onClick={() => onEdit(g)}
                  aria-label="编辑长期任务"
                  title="编辑"
                  className="mt-0.5 shrink-0 rounded p-0.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  <Pencil size={13} />
                </button>
              </div>

              {/* 日期 + 进度 + 统计 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1 text-[11px] text-text-faint">
                  <CalendarRange size={11} className="shrink-0" />
                  <span className="truncate">
                    {g.startDate ? g.startDate.slice(5) : "?"} ~{" "}
                    {g.deadline ? g.deadline.slice(5) : "未设"}
                  </span>
                </div>
                <button
                  onClick={() => onComplete(g)}
                  title="标记完成"
                  aria-label="完成长期任务"
                  className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:bg-green-50 hover:text-green-600"
                >
                  <Check size={14} />
                </button>
              </div>

              {/* 进度条 + 百分比 */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${g.progressPercent}%`, backgroundColor: color }}
                  />
                </div>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text-secondary">
                  {g.progressPercent}%
                </span>
              </div>

              {/* 关联任务 / 专注 */}
              <div className="flex items-center gap-3 text-[11px] text-text-muted">
                <span className="flex items-center gap-1 tabular-nums">
                  <Check size={11} className="text-success" />
                  {g.completedTasks}/{g.totalTasks} 任务
                </span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Timer size={11} />
                  {formatDurationCompact(g.focusSeconds) || "0分钟"}
                </span>
                <span className="flex items-center gap-0.5 tabular-nums">
                  <FolderKanban size={11} />
                  {list.length} 项目
                </span>
              </div>

              {/* 项目 chips（点击跳今日筛选）+ 行内添加 */}
              {list.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {list.map((p) => {
                    const st = projectSummary[p.id];
                    const done = st?.completed ?? 0;
                    return (
                      <span
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenProject?.(p.id)}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && onOpenProject) {
                            e.preventDefault();
                            onOpenProject(p.id);
                          }
                        }}
                        title="点击到今日查看该项目任务"
                        className="group flex cursor-pointer items-center gap-1 rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent/60 hover:text-text-primary"
                      >
                        <span className="max-w-28 truncate">{p.title}</span>
                        <span className="tabular-nums text-text-faint">{done}</span>
                        <button
                          aria-label="删除项目"
                          title="删除项目（任务保留）"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(p.id);
                          }}
                          className="rounded p-px text-text-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-1">
                <input
                  value={drafts[g.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addProject(g.id);
                  }}
                  placeholder="添加项目…"
                  className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-1.5 py-0.5 text-[11px] text-text-primary outline-none placeholder:text-text-faint focus:border-accent"
                />
                <button
                  onClick={() => void addProject(g.id)}
                  disabled={!(drafts[g.id] ?? "").trim()}
                  aria-label={`添加项目到 ${g.title}`}
                  title="添加项目"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-faint"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
