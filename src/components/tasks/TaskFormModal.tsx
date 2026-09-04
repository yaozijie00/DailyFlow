import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { useGoalStore } from "../../stores/goalStore";
import { useProjectStore } from "../../stores/projectStore";
import { formatTimeRange } from "../../lib/timeline";
import { REPEAT_RULES } from "../../lib/repeat";
import { TASK_PRIORITIES, taskPriorityMeta, type TaskPriority } from "../../lib/taskPriority";

export default function TaskFormModal() {
  const isCreateOpen = useTaskStore((s) => s.isCreateOpen);
  const editingTaskId = useTaskStore((s) => s.editingTaskId);
  const createDraft = useTaskStore((s) => s.createDraft);
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const goals = useGoalStore((s) => s.goals);
  const projects = useProjectStore((s) => s.projects);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const closeCreate = useTaskStore((s) => s.closeCreate);
  const closeEdit = useTaskStore((s) => s.closeEdit);

  const editingTask =
    editingTaskId != null ? tasks.find((t) => t.id === editingTaskId) : undefined;
  const open = isCreateOpen || editingTaskId != null;

  const hasDraft =
    createDraft?.plannedStart != null && createDraft?.plannedEnd != null;

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [repeatRule, setRepeatRule] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  // 打开表单时按需加载项目（长期页可先建项目）
  useEffect(() => {
    if (open && useProjectStore.getState().projects.length === 0) {
      void useProjectStore.getState().load();
    }
  }, [open]);

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setCategoryId(editingTask.categoryId != null ? String(editingTask.categoryId) : "");
      setGoalId(editingTask.goalId != null ? String(editingTask.goalId) : "");
      setProjectId(editingTask.projectId != null ? String(editingTask.projectId) : "");
      // 用十进制分钟展示，避免子分钟精度丢失（如 90 秒 → "1.5"）
      setEstimatedMinutes(
        editingTask.estimatedDuration != null
          ? String(editingTask.estimatedDuration / 60)
          : "",
      );
      setNotes(editingTask.notes ?? "");
      setRepeatRule(editingTask.repeatRule ?? "");
      setPriority(taskPriorityMeta(editingTask.priority).value);
    } else if (hasDraft) {
      setTitle("");
      setCategoryId("");
      setGoalId("");
      setProjectId("");
      setEstimatedMinutes(
        String((createDraft.plannedEnd! - createDraft.plannedStart!) / 60000),
      );
      setNotes("");
      setRepeatRule("");
      setPriority("medium");
    } else {
      setTitle("");
      setCategoryId("");
      setGoalId("");
      setProjectId("");
      setEstimatedMinutes("");
      setNotes("");
      setRepeatRule("");
      setPriority("medium");
    }
  }, [editingTaskId, isCreateOpen, editingTask, createDraft, hasDraft]);

  if (!open) return null;

  const close = () => {
    if (editingTask) closeEdit();
    else closeCreate();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    const estimated = estimatedMinutes === "" ? null : Number(estimatedMinutes);
    const payload = {
      title: trimmed,
      categoryId: categoryId === "" ? null : Number(categoryId),
      goalId: goalId === "" ? null : Number(goalId),
      projectId: projectId === "" ? null : Number(projectId),
      estimatedDuration:
        estimated == null || Number.isNaN(estimated) || estimated < 0
          ? null
          : Math.round(estimated * 60),
      notes: notes.trim() === "" ? null : notes.trim(),
      repeatRule,
      priority,
      ...(hasDraft
        ? {
            plannedStart: createDraft.plannedStart,
            plannedEnd: createDraft.plannedEnd,
          }
        : {}),
    };

    if (editingTask) {
      await updateTask(editingTask.id, payload);
    } else {
      await createTask(payload);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editingTask ? "编辑任务" : "创建任务"}
          </h2>
          <button onClick={close} className="text-neutral-400 hover:text-neutral-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasDraft && (
            <div>
              <label className="mb-1 block text-sm text-neutral-600">任务时间</label>
              <div className="rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-900">
                {formatTimeRange(createDraft.plannedStart!, createDraft.plannedEnd!)}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-neutral-600">任务名称</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="例如：写代码"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">优先级</label>
            <div className="flex gap-2">
              {TASK_PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      active ? "" : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                    }`}
                    style={
                      active
                        ? { color: p.text, backgroundColor: p.bg, borderColor: p.text }
                        : undefined
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">类别</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">无</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">关联长期目标</label>
            <select
              value={goalId}
              onChange={(e) => {
                setGoalId(e.target.value);
                setProjectId(""); // 目标变更后项目需重新选择
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">无</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">项目（可选）</label>
            <select
              value={projectId}
              onChange={(e) => {
                const v = e.target.value;
                setProjectId(v);
                // 选项目时自动补全所属目标（未选目标的情况）
                if (v !== "" && goalId === "") {
                  const p = projects.find((x) => x.id === Number(v));
                  if (p?.goalId != null) setGoalId(String(p.goalId));
                }
              }}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">无</option>
              {projects
                .filter((p) => (goalId === "" ? true : p.goalId === Number(goalId)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {goalId === "" && p.goalTitle ? `（${p.goalTitle}）` : ""}
                  </option>
                ))}
            </select>
            {goalId !== "" && projects.filter((p) => p.goalId === Number(goalId)).length === 0 && (
              <p className="mt-1 text-[11px] text-neutral-400">
                该目标下暂无项目，可先到「长期」页创建
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">预计时间（分钟）</label>
            <input
              type="number"
              min={0}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="例如：90"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">重复</label>
            <select
              value={repeatRule}
              onChange={(e) => setRepeatRule(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              {REPEAT_RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-400">
              完成后自动生成下一次任务（每天/工作日/每周/每月）
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-neutral-600">备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="补充信息（可选）"
              rows={3}
              className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
            >
              {editingTask ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
