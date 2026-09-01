import type { Note } from "../db/repositories/noteRepository";
import type { Task } from "../db/repositories/taskRepository";

/** 投放区：今日任务列表 / 时间轴 / 便签区（反向拖拽目标）。 */
export type NoteDropZone = "tasklist" | "timeline" | "notelist";

/**
 * 便签拖拽会话（鼠标拖拽，替代 HTML5 拖放：WebView2 下 HTML5 DnD 不可靠，
 * 与任务行 → 时间轴的 useWindowDrag 方案保持一致）。
 * 由 NoteList 的 mousedown 驱动，TaskList / Timeline 通过 noteDropZoneAt 感知悬停。
 */
export const noteDragSession: {
  noteId: number | null;
  over: NoteDropZone | null;
} = { noteId: null, over: null };

/** 投放区注册的 drop 回调（TaskList / Timeline 挂载时注册、卸载时清除）。 */
export const noteDropCallbacks: Partial<
  Record<NoteDropZone, (noteId: number, clientX: number, clientY: number) => void>
> = {};

/** 指针所在投放区：命中元素向上找 [data-note-drop]，未命中返回 null。 */
export function noteDropZoneAt(x: number, y: number): NoteDropZone | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const zone = el?.closest?.("[data-note-drop]") as HTMLElement | null;
  const kind = zone?.dataset.noteDrop;
  return kind === "tasklist" || kind === "timeline" || kind === "notelist" ? kind : null;
}

// ---------- 反向拖拽：任务 → 便签（V2 Phase 3） ----------

/** 任务 → 便签 拖拽会话（任务列表行 / 时间轴块拖向便签区时写入 taskId）。 */
export const taskToNoteDrag: { taskId: number | null } = { taskId: null };

/** 便签区注册的 drop 回调（把拖入的任务转为便签）。 */
export const taskToNoteDropCallbacks: {
  notelist?: (taskId: number) => void;
} = {};

export interface NoteConvertOptions {
  /** 目标日期（默认今日由 TaskService 决定） */
  scheduledDate?: string;
  /** 时间轴落点（便签 → 时间轴时传入） */
  plannedStart?: number;
  plannedEnd?: number;
}

/**
 * 便签转任务（今日任务列表 / 时间轴共用）：
 * - 创建 Task（标题/分类继承；可选日期与时间块）
 * - 成功后原便签标记为「已安排」（arranged，不可重复拖拽）
 * 防重复：仅 active 便签可转换；创建失败则不标记，状态保持一致。
 */
export async function convertNoteToTask(
  noteId: number,
  notes: Note[],
  createTask: (input: {
    title: string;
    categoryId: number | null;
    scheduledDate?: string;
    plannedStart?: number | null;
    plannedEnd?: number | null;
  }) => Promise<void>,
  updateNote: (id: number, input: { status: "arranged" }) => Promise<void>,
  options: NoteConvertOptions = {},
): Promise<boolean> {
  const note = notes.find((n) => n.id === noteId);
  if (!note || note.status !== "active") return false;
  try {
    await createTask({
      title: note.title,
      categoryId: note.categoryId ?? null,
      scheduledDate: options.scheduledDate,
      plannedStart: options.plannedStart ?? null,
      plannedEnd: options.plannedEnd ?? null,
    });
    await updateNote(note.id, { status: "arranged" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 任务转便签（反向拖拽，V2 Phase 3）：
 * - 用任务标题/分类创建一条 active 便签；
 * - 删除原任务行（仅删任务，focus_sessions 由 FK SET NULL 保留 → 统计不丢失投入时间）；
 * - 不产生「任务 + 便签」重复对象，用户感知为「把同一件事拖回便签」。
 * 防重复：仅存在的任务可转换；任一步失败则回滚（删掉刚建的便签），状态保持一致。
 */
export async function convertTaskToNote(
  taskId: number,
  tasks: Task[],
  createNote: (input: { title: string; categoryId: number | null }) => Promise<{ id: number }>,
  deleteTaskRow: (id: number) => Promise<unknown>,
  deleteNote: (id: number) => Promise<unknown>,
): Promise<boolean> {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return false;
  let noteId: number | null = null;
  try {
    const note = await createNote({
      title: task.title,
      categoryId: task.categoryId ?? null,
    });
    noteId = note.id;
    await deleteTaskRow(taskId);
    return true;
  } catch {
    if (noteId != null) {
      await deleteNote(noteId).catch(() => {});
    }
    return false;
  }
}
