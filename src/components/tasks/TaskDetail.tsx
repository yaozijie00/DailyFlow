import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { formatDuration } from "../../lib/format";
import { TASK_STATUS_LABEL } from "../../lib/taskLabels";

export default function TaskDetail() {
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const categories = useTaskStore((s) => s.categories);
  const completeTask = useTaskStore((s) => s.completeTask);
  const cancelTask = useTaskStore((s) => s.cancelTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const openEdit = useTaskStore((s) => s.openEdit);

  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const task = tasks.find((t) => t.id === selectedTaskId);

  if (!task) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400">
        点击左侧任务查看详情
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
