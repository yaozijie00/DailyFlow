import { useEffect, useState, type FormEvent } from "react";
import { Target, CalendarDays, Check, X, Pencil, Plus } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useGoalStore } from "../stores/goalStore";
import type { GoalWithProgress } from "../db/repositories/goalRepository";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className="h-full rounded-full bg-neutral-900"
        style={{ width: `${Math.max(2, percentage)}%` }}
      />
    </div>
  );
}

interface GoalFormState {
  title: string;
  description: string;
  deadline: string;
}

function emptyForm(): GoalFormState {
  return { title: "", description: "", deadline: "" };
}

/** 目标卡片（含内联编辑与操作按钮）。 */
function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const update = useGoalStore((s) => s.update);
  const complete = useGoalStore((s) => s.complete);
  const remove = useGoalStore((s) => s.remove);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GoalFormState>(() => ({
    title: goal.title,
    description: goal.description ?? "",
    deadline: goal.deadline ?? "",
  }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    await update(goal.id, {
      title,
      description: form.description.trim() === "" ? null : form.description.trim(),
      deadline: form.deadline === "" ? null : form.deadline,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4"
      >
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="目标名称"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="补充说明（可选）"
          rows={2}
          className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <input
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            保存
          </button>
        </div>
      </form>
    );
  }

  const percentage =
    goal.totalTasks > 0 ? Math.round((goal.completedTasks / goal.totalTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900">{goal.title}</div>
          {goal.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{goal.description}</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => {
              setForm({ title: goal.title, description: goal.description ?? "", deadline: goal.deadline ?? "" });
              setEditing(true);
            }}
            aria-label="编辑目标"
            title="编辑"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => void complete(goal.id)}
            aria-label="完成目标"
            title="完成（保留历史）"
            className="rounded p-1 text-neutral-400 hover:bg-green-50 hover:text-green-600"
          >
            <Check size={14} />
          </button>
          <button
            onClick={() => void remove(goal.id)}
            aria-label="删除目标"
            title="删除"
            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
          >
            <X size={14} />
          </button>
        </span>
      </div>

      {goal.deadline && (
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <CalendarDays size={12} />
          <span>截止 {goal.deadline}</span>
        </div>
      )}

      <div className="space-y-1">
        <ProgressBar percentage={percentage} />
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span className="tabular-nums">
            关联任务 {goal.completedTasks}/{goal.totalTasks}
          </span>
          <span className="tabular-nums">
            {goal.totalTasks > 0 ? `${percentage}%` : "暂无任务"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Goals() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const goals = useGoalStore((s) => s.goals);
  const completedGoals = useGoalStore((s) => s.completedGoals);
  const loading = useGoalStore((s) => s.loading);
  const create = useGoalStore((s) => s.create);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<GoalFormState>(emptyForm);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useGoalStore.getState().load();
    }
  }, [dbStatus]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return;
    await create({
      title,
      description: form.description.trim() === "" ? null : form.description.trim(),
      deadline: form.deadline === "" ? null : form.deadline,
    });
    setForm(emptyForm());
    setShowCreate(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="长期目标"
        description={`进行中 ${goals.length} · 已完成 ${completedGoals.length}；把日常任务关联到目标，进度自动统计`}
        actions={
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
          >
            <Plus size={16} />
            新建目标
          </button>
        }
      />

      {showCreate && (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4"
        >
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="目标名称，例如：三个月内完成 App 重构"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="补充说明（可选）"
            rows={2}
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <div className="flex items-center justify-between gap-2">
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setForm(emptyForm());
                }}
                className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={form.title.trim().length === 0}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-40"
              >
                添加
              </button>
            </div>
          </div>
        </form>
      )}

      {loading && goals.length === 0 ? (
        <div className="text-sm text-neutral-400">加载中…</div>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={28} />}
          title="暂无进行中的目标"
          description="先定一个小目标，再把任务关联上去。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {completedGoals.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            {showCompleted ? "▾" : "▸"} 已完成（{completedGoals.length}）
          </button>
          {showCompleted && (
            <div className="mt-2 space-y-1">
              {completedGoals.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500"
                >
                  <Check size={14} className="shrink-0 text-green-600" />
                  <span className="truncate line-through decoration-neutral-300">{g.title}</span>
                  {g.deadline && (
                    <span className="ml-auto shrink-0 text-xs text-neutral-400">
                      {g.deadline}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
