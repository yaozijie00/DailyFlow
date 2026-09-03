import { useEffect, useState } from "react";
import { FolderKanban, Plus, X } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import type { GoalWithProgress } from "../../db/repositories/goalRepository";

/**
 * 长期页「目标项目」管理（v1.8 Goal → Project）：
 * - 每个进行中目标下可添加/删除项目（删除带撤销 Toast）；
 * - 任务表单可按目标选择项目（选项目自动联动目标）。
 */
export default function ProjectManager({ goals }: { goals: GoalWithProgress[] }) {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const projects = useProjectStore((s) => s.projects);
  const create = useProjectStore((s) => s.create);
  const remove = useProjectStore((s) => s.remove);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (dbStatus === "ready") void useProjectStore.getState().load();
  }, [dbStatus]);

  if (goals.length === 0) return null;

  const add = async (goalId: number) => {
    const t = (drafts[goalId] ?? "").trim();
    if (!t) return;
    const ok = await create(goalId, t);
    if (ok) setDrafts((d) => ({ ...d, [goalId]: "" }));
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <FolderKanban size={15} className="text-ink-3" />
        目标项目
        <span className="text-xs font-normal text-ink-3">
          把任务归入项目，任务将自动归属于对应目标
        </span>
      </div>
      {goals.map((g) => {
        const list = projects.filter((p) => p.goalId === g.id);
        return (
          <div key={g.id} className="rounded-md border border-line bg-surface p-3">
            <div className="mb-2 text-xs font-medium text-ink-2">
              {g.title}
              <span className="ml-1.5 text-ink-3">{list.length} 个项目</span>
            </div>
            {list.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {list.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-xs text-ink"
                  >
                    {p.title}
                    <button
                      aria-label="删除项目"
                      title="删除项目（任务保留）"
                      onClick={() => void remove(p.id)}
                      className="text-ink-3 hover:text-error"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
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
                className="min-w-0 flex-1 rounded-md border border-line-strong px-2 py-1 text-xs outline-none focus:border-brand"
              />
              <button
                onClick={() => void add(g.id)}
                disabled={!(drafts[g.id] ?? "").trim()}
                className="flex shrink-0 items-center gap-0.5 rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-line"
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
