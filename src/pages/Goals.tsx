import { useEffect, useState, type FormEvent } from "react";
import { Check, Plus, Trash2, RotateCcw } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useGoalStore } from "../stores/goalStore";
import type { GoalWithProgress } from "../db/repositories/goalRepository";
import { PageHeader } from "../components/ui/PageHeader";
import MonthView from "../components/goals/MonthView";
import ProjectManager from "../components/goals/ProjectManager";
import CourseSchedule from "../components/goals/CourseSchedule";
import { formatDuration } from "../lib/format";

interface GoalFormState {
  title: string;
  description: string;
  startDate: string;
  deadline: string;
  priority: "high" | "medium" | "low";
  manualProgress: string; // 空 = 自动
}

function emptyForm(): GoalFormState {
  return { title: "", description: "", startDate: "", deadline: "", priority: "medium", manualProgress: "" };
}

function toInput(goal: GoalWithProgress): GoalFormState {
  return {
    title: goal.title,
    description: goal.description ?? "",
    startDate: goal.startDate ?? "",
    deadline: goal.deadline ?? "",
    priority: (goal.priority as "high" | "medium" | "low") ?? "medium",
    manualProgress: goal.manualProgress != null ? String(goal.manualProgress) : "",
  };
}

function payloadOf(form: GoalFormState) {
  const mp = form.manualProgress.trim();
  return {
    title: form.title.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    startDate: form.startDate === "" ? null : form.startDate,
    deadline: form.deadline === "" ? null : form.deadline,
    priority: form.priority,
    manualProgress:
      mp === "" ? null : Math.max(0, Math.min(100, Math.round(Number(mp) || 0))),
  };
}

export default function Goals() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const goals = useGoalStore((s) => s.goals);
  const completedGoals = useGoalStore((s) => s.completedGoals);
  const loading = useGoalStore((s) => s.loading);
  const create = useGoalStore((s) => s.create);
  const update = useGoalStore((s) => s.update);
  const complete = useGoalStore((s) => s.complete);
  const restore = useGoalStore((s) => s.restore);
  const remove = useGoalStore((s) => s.remove);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<GoalFormState>(emptyForm);
  const [editing, setEditing] = useState<GoalWithProgress | null>(null);
  const [editForm, setEditForm] = useState<GoalFormState>(emptyForm);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useGoalStore.getState().load();
    }
  }, [dbStatus]);

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await create(payloadOf(form));
    setForm(emptyForm());
    setShowCreate(false);
  };

  /** 月历空白格/圈选：预填日期范围打开新建表单。 */
  const createOnDates = (startDate: string, endDate: string) => {
    setForm({ ...emptyForm(), startDate, deadline: endDate });
    setShowCreate(true);
  };

  const openEdit = (goal: GoalWithProgress) => {
    setEditing(goal);
    setEditForm(toInput(goal));
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await update(editing.id, payloadOf(editForm));
    setEditing(null);
  };

  const moveRange = (goalId: number, startDate: string, endDate: string) => {
    void update(goalId, { startDate, deadline: endDate });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader
        title="长期"
        description={`月规划 · 进行中 ${goals.length} · 已完成 ${completedGoals.length}；任务关联目标后进度自动统计`}
        actions={
          <button
            onClick={() => {
              if (!showCreate) setForm(emptyForm());
              setShowCreate((v) => !v);
            }}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-700"
          >
            <Plus size={16} />
            新建
          </button>
        }
      />

      {showCreate && (
        <form
          onSubmit={submitCreate}
          className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4"
        >
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="名称，例如：完成 DailyFlow V2"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="补充说明（可选）"
            rows={2}
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-neutral-400">至</span>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as GoalFormState["priority"] })}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={form.manualProgress}
              onChange={(e) => setForm({ ...form, manualProgress: e.target.value })}
              placeholder="进度%（留空自动）"
              className="w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
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
        </form>
      )}

      {loading && goals.length === 0 ? (
        <div className="text-sm text-neutral-400">加载中…</div>
      ) : (
        <MonthView
          goals={goals}
          onEdit={openEdit}
          onMoveRange={moveRange}
          onRequestCreate={createOnDates}
        />
      )}

      {/* 目标下的项目管理（v1.8 Goal → Project） */}
      {goals.length > 0 && <ProjectManager goals={goals} />}

      {/* 课程表（2.0.x：每周固定学习安排） */}
      <CourseSchedule />

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">编辑长期任务</h2>
            <form onSubmit={submitEdit} className="space-y-3">
              <input
                autoFocus
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="补充说明（可选）"
                rows={2}
                className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-neutral-400">至</span>
                <input
                  type="date"
                  value={editForm.deadline}
                  onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as GoalFormState["priority"] })}
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  <option value="high">高优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="low">低优先级</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editForm.manualProgress}
                  onChange={(e) => setEditForm({ ...editForm, manualProgress: e.target.value })}
                  placeholder="进度%（留空自动）"
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="text-xs text-neutral-500">
                进度：{editing.progressPercent}% · 关联任务 {editing.completedTasks}/{editing.totalTasks} · 专注投入 {formatDuration(editing.focusSeconds) || "0分钟"}
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    void complete(editing.id);
                    setEditing(null);
                  }}
                  className="flex items-center gap-1 rounded-md border border-green-200 px-3 py-1.5 text-sm text-green-600 hover:bg-green-50"
                >
                  <Check size={14} /> 完成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void remove(editing.id);
                    setEditing(null);
                  }}
                  className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} /> 删除
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
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
              </div>
            </form>
          </div>
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
                  className="group flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500"
                >
                  <Check size={14} className="shrink-0 text-green-600" />
                  <span className="min-w-0 flex-1 truncate line-through decoration-neutral-300">
                    {g.title}
                  </span>
                  {g.deadline && (
                    <span className="hidden shrink-0 text-xs text-neutral-400 sm:block">
                      {g.deadline}
                    </span>
                  )}
                  <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={() => void restore(g.id)}
                      aria-label="恢复长期任务"
                      title="恢复为进行中（误完成可修正）"
                      className="rounded p-0.5 text-neutral-400 hover:bg-green-50 hover:text-green-600"
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      onClick={() => void remove(g.id)}
                      aria-label="删除已完成任务"
                      title="删除（可撤销）"
                      className="rounded p-0.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
