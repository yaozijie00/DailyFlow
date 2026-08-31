import type { Note } from "../db/repositories/noteRepository";

/** 便签投放区（今日任务列表 / 时间轴）。 */
export type NoteDropZone = "tasklist" | "timeline";

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
  return kind === "tasklist" || kind === "timeline" ? kind : null;
}

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
