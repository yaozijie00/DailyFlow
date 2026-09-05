import { useEffect, useState } from "react";
import { FolderKanban, Plus, X } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useTaskStore } from "../../stores/taskStore";
import { useProjectStore } from "../../stores/projectStore";
import { formatDurationCompact } from "../../lib/format";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";

interface ProjectManagerProps {
  goals: GoalWithProgress[];
  /** 点击项目卡 → 到今日筛选该项目任务 */
  onOpenProject?: (projectId: number) => void;
}

/**
 * 长期页「目标项目」管理（v1.8 Goal → Project，v2.3.x 信息卡升级）：
 * - 每个进行中目标下可添加/删除项目（删除带撤销 Toast）；
 * - 项目以卡片展示：待办/已完成任务数 + 关联专注累计投入；点击卡片跳今日筛选该项目任务；
 * - 任务表单可按目标选择项目（选项目自动联动目标）。
 */
export default function ProjectManager({ goals, onOpenProject }: ProjectManagerProps) {
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

  if (goals.length === 0) return null;

  const add = async (goalId: number) => {
    const t = (drafts[goalId] ?? "").trim();
    if (!t) return;
    const ok = await create(goalId, t);
    if (ok) {
      setDrafts((d) => ({ ...d, [goalId]: "" }));
      void useTaskStore.getState().loadProjectSummary(); // 新建后刷新统计
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
        <FolderKanban size={15} className="text-text-faint" />
        目标项目
        <span className="text-xs font-normal text-text-faint">
          项目 = 目标下的任务分组 · 点击项目卡可到今日查看该项目任务
        </span>
      </div>
      {goals.map((g) => {
        const list = projects.filter((p) => p.goalId === g.id);
        return (
          <div key={g.id} className="rounded-md border border-border-subtle glass-surface p-3">
            <div className="mb-2 text-xs font-medium text-text-secondary">
              {g.title}
              <span className="ml-1.5 text-text-faint">{list.length} 个项目</span>
            </div>
            {list.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {list.map((p) => {
                  const st = projectSummary[p.id];
                  const todo = st?.todo ?? 0;
                  const done = st?.completed ?? 0;
                  const seconds = st?.seconds ?? 0;
                  return (
                    <div
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
                      title="点击到今日查看该项目的任务"
                      className="group min-w-[9rem] cursor-pointer rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                          {p.title}
                        </span>
                        <button
                          aria-label="删除项目"
                          title="删除项目（任务保留）"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(p.id);
                          }}
                          className="shrink-0 rounded p-0.5 text-text-faint transition-colors hover:text-red-500 group-hover:text-text-faint"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-text-faint">
                        进行中 {todo} · 已完成 {done}
                        {seconds > 0 ? ` · 投入 ${formatDurationCompact(seconds)}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                value={drafts[g.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add(g.id);
                }}
                placeholder={`添加项目到「${g.title}」`}
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-text-primary outline-none placeholder:text-text-faint focus:border-accent"
              />
              <button
                onClick={() => void add(g.id)}
                disabled={!(drafts[g.id] ?? "").trim()}
                className="flex shrink-0 items-center gap-0.5 rounded-md bg-accent px-2 py-1 text-xs text-on-accent hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-faint"
              >
                <Plus size={12} /> 添加
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
