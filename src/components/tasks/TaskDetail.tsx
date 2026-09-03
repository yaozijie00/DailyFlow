import { useState } from "react";
import { Check, Pencil, Trash2, CornerDownRight } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { useGoalStore } from "../../stores/goalStore";
import { useProjectStore } from "../../stores/projectStore";
import { useTaskFocusStats } from "../../hooks/useTaskFocusStats";
import { formatDuration, formatDateTime } from "../../lib/format";
import { formatTimeRange } from "../../lib/timeline";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";
import { postponeTargets } from "../../lib/postpone";
import { todayString } from "../../lib/date";

export default function TaskDetail() {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const goals = useGoalStore((s) => s.goals);
  const projects = useProjectStore((s) => s.projects);
  const completeTask = useTaskStore((s) => s.completeTask);
  const toggleComplete = useTaskStore((s) => s.toggleComplete);
  const createSubtask = useTaskStore((s) => s.createSubtask);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const selectTask = useTaskStore((s) => s.selectTask);
  const openEdit = useTaskStore((s) => s.openEdit);

  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [childDraft, setChildDraft] = useState("");

  const task = tasks.find((t) => t.id === selectedTaskId);
  const focusStats = useTaskFocusStats(task?.id ?? null);

  if (!task) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
        点击左侧任务或时间轴任务块查看详情
      </div>
    );
  }

  const saveNotes = async () => {
    const v = notesDraft.trim();
    await updateTask(task.id, { notes: v === "" ? null : v });
    setNotesEditing(false);
  };

  const categoryName =
    task.categoryId != null
      ? (categories.find((c) => c.id === task.categoryId)?.name ?? "无")
      : "无";
  const goalName =
    task.goalId != null ? (goals.find((g) => g.id === task.goalId)?.title ?? "无") : "无";
  const projectName =
    task.projectId != null
      ? (projects.find((p) => p.id === task.projectId)?.title ?? "无")
      : "无";
  const children = task.parentId == null ? tasks.filter((t) => t.parentId === task.id) : [];
  const doneChildren = children.filter((c) => c.status === "COMPLETED").length;
  const parentTask = task.parentId != null ? tasks.find((t) => t.id === task.parentId) : undefined;

  const addChild = async () => {
    const t = childDraft.trim();
    if (!t) return;
    await createSubtask(task, t);
    setChildDraft("");
  };
  const completed = task.status === "COMPLETED";
  const cancelled = task.status === "CANCELLED";

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">{task.title}</h2>

      <dl className="mb-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">类别</dt>
          <dd className="text-neutral-900">{categoryName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">关联目标</dt>
          <dd className="text-neutral-900">{goalName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">项目</dt>
          <dd className="text-neutral-900">{projectName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">计划时间</dt>
          <dd className="text-neutral-900">
            {task.plannedStart != null && task.plannedEnd != null
              ? formatTimeRange(task.plannedStart, task.plannedEnd)
              : "未设置"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">预计</dt>
          <dd className="text-neutral-900">{formatDuration(task.estimatedDuration) || "未设置"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">实际</dt>
          <dd className="text-neutral-900">{formatDuration(task.actualDuration) || "0分钟"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">状态</dt>
          <dd className="text-neutral-900">{TASK_STATUS_LABEL[task.status] ?? task.status}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">创建时间</dt>
          <dd className="text-neutral-900">{formatDateTime(task.createdAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">完成时间</dt>
          <dd className="text-neutral-900">{formatDateTime(task.completedAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">Focus 投入</dt>
          <dd className="text-neutral-900">{formatDuration(focusStats.totalSeconds) || "0分钟"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">专注次数</dt>
          <dd className="text-neutral-900">
            {focusStats.count} 次（完成 {focusStats.completedCount} 个番茄）
          </dd>
        </div>
      </dl>

      {/* 备注（可内联编辑） */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm text-neutral-500">备注</span>
          {!notesEditing && (
            <button
              onClick={() => {
                setNotesDraft(task.notes ?? "");
                setNotesEditing(true);
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              {task.notes ? "编辑" : "添加备注"}
            </button>
          )}
        </div>
        {notesEditing ? (
          <div className="space-y-1.5">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              placeholder="记录补充信息…"
              className="w-full resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
            />
            <div className="flex gap-2">
              <button
                onClick={() => void saveNotes()}
                className="rounded-md bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700"
              >
                保存
              </button>
              <button
                onClick={() => setNotesEditing(false)}
                className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
              >
                取消
              </button>
            </div>
          </div>
        ) : task.notes ? (
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{task.notes}</p>
        ) : (
          <p className="text-sm text-neutral-300">无</p>
        )}
      </div>

      {/* 子任务（v1.8 拆分）：父任务下可加子项，勾选进度 */}
      {!task.parentId && (
        <div className="mb-4 border-t border-neutral-100 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm text-neutral-500">子任务（拆分）</span>
            {children.length > 0 && (
              <span className="text-xs tabular-nums text-neutral-400">
                {doneChildren}/{children.length} 完成
              </span>
            )}
          </div>
          {children.length > 0 && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-800 transition-all"
                style={{
                  width: `${Math.round((doneChildren / children.length) * 100)}%`,
                }}
              />
            </div>
          )}
          <ul className="space-y-1">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <button
                  aria-label={`完成子任务 ${c.title}`}
                  title={c.status === "COMPLETED" ? "恢复为待办" : "标记完成"}
                  onClick={() => void toggleComplete(c.id)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    c.status === "COMPLETED"
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {c.status === "COMPLETED" && <Check size={12} />}
                </button>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    c.status === "COMPLETED"
                      ? "text-neutral-400 line-through decoration-neutral-300"
                      : "text-neutral-800"
                  }`}
                >
                  {c.title}
                </span>
                <button
                  aria-label="删除子任务"
                  title="删除子任务"
                  onClick={() => void deleteTask(c.id)}
                  className="shrink-0 text-neutral-300 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <input
              value={childDraft}
              onChange={(e) => setChildDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addChild();
              }}
              placeholder="拆分子任务：输入名称后回车"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
            />
            <button
              onClick={() => void addChild()}
              disabled={childDraft.trim().length === 0}
              className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              添加子任务
            </button>
          </div>
        </div>
      )}

      {/* 子任务归属提示（当前是子任务时） */}
      {task.parentId != null && parentTask && (
        <div className="mb-4 flex items-center gap-1.5 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <CornerDownRight size={13} className="text-neutral-400" />
          属于「{parentTask.title}」
          <button
            onClick={() => selectTask(parentTask.id)}
            className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
          >
            查看父任务
          </button>
        </div>
      )}

      {/* 延期（Postpone）：改 scheduledDate，可撤销 */}
      {!completed && !cancelled && (
        <div className="mb-4 border-t border-neutral-100 pt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm text-neutral-500">延期到</span>
            <span className="text-xs text-neutral-400">
              当前：{task.scheduledDate}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: "tomorrow", label: "明天", date: postponeTargets(todayString()).tomorrow },
                { key: "weekend", label: "周末", date: postponeTargets(todayString()).weekend },
                { key: "nextWeek", label: "下周", date: postponeTargets(todayString()).nextWeek },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                title={p.date}
                onClick={() => {
                  void updateTask(task.id, { scheduledDate: p.date });
                  selectTask(null);
                }}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:border-neutral-500 hover:bg-neutral-50"
              >
                {p.label}
                <span className="ml-1 text-neutral-400">
                  {p.date.slice(5).replace("-", "/")}
                </span>
              </button>
            ))}
            <input
              type="date"
              value={task.scheduledDate}
              onChange={(e) => {
                if (!e.target.value) return;
                void updateTask(task.id, { scheduledDate: e.target.value });
                selectTask(null);
              }}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
              title="自定义日期"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!completed && !cancelled && (
          <button
            onClick={() => completeTask(task.id)}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
          >
            完成任务
          </button>
        )}
        {!completed && !cancelled && (
          <button
            onClick={() => cancelTask(task.id)}
            className="rounded-md bg-neutral-200 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-300"
          >
            取消任务
          </button>
        )}
        <button
          onClick={() => openEdit(task.id)}
          className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          <Pencil size={14} /> 编辑
        </button>
        <button
          onClick={() => deleteTask(task.id)}
          className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 size={14} /> 删除
        </button>
      </div>
    </div>
  );
}
