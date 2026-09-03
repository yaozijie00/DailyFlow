import { useEffect, useState } from "react";
import { StickyNote, Check, X, Plus, RotateCcw } from "lucide-react";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useAppStore } from "../../stores/appStore";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import {
  noteDragSession,
  noteDropCallbacks,
  noteDropZoneAt,
  taskToNoteDrag,
  taskToNoteDropCallbacks,
} from "../../lib/noteConvert";
import type { Note } from "../../db/repositories/noteRepository";

/** 便签项：hover 显示操作；双击文字进入编辑；按住拖动到任务列表/时间轴。 */
function NoteItem({ note }: { note: Note }) {
  const update = useNoteStore((s) => s.update);
  const complete = useNoteStore((s) => s.complete);
  const remove = useNoteStore((s) => s.remove);
  const { start: startWindowDrag } = useWindowDrag();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);

  const arranged = note.status === "arranged";

  const saveEdit = () => {
    const t = draft.trim();
    if (t && t !== note.title) void update(note.id, { title: t });
    setEditing(false);
  };

  /** 鼠标拖拽（与任务行 → 时间轴一致）：位移超过阈值开始，松手按落点投放区转换。 */
  function beginNoteDrag(e: React.MouseEvent) {
    if (arranged || editing || e.button !== 0) return;
    e.preventDefault(); // 阻止拖拽过程中选中文字
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const finish = () => {
      noteDragSession.noteId = null;
      noteDragSession.over = null;
    };

    startWindowDrag(
      {
        onMove: (ev) => {
          if (!dragging) {
            if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 4) return;
            dragging = true;
            noteDragSession.noteId = note.id;
          }
          noteDragSession.over = noteDropZoneAt(ev.clientX, ev.clientY);
        },
        onUp: (ev) => {
          if (!dragging) return;
          const over = noteDropZoneAt(ev.clientX, ev.clientY);
          if (over) noteDropCallbacks[over]?.(note.id, ev.clientX, ev.clientY);
          finish();
        },
      },
      finish,
    );
  }

  return (
    <li
      onMouseDown={beginNoteDrag}
      className={`group flex cursor-grab items-start gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
        arranged
          ? "border-dashed border-line bg-raised opacity-70"
          : "border-line bg-surface hover:border-line-strong"
      }`}
      title={arranged ? "已安排到今日（不可再次拖拽）" : "按住拖动到今日任务列表或时间轴"}
    >
      <StickyNote
        size={14}
        className={`mt-0.5 shrink-0 ${arranged ? "text-ink-3" : "text-warn"}`}
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            else if (e.key === "Escape") {
              setDraft(note.title);
              setEditing(false);
            }
          }}
          onBlur={saveEdit}
          className="min-w-0 flex-1 rounded border border-line-strong px-1 py-0.5 text-sm"
        />
      ) : (
        <button
          onDoubleClick={() => {
            setDraft(note.title);
            setEditing(true);
          }}
          className={`min-w-0 flex-1 truncate text-left text-sm ${
            arranged ? "text-ink-2 line-through decoration-neutral-300" : "text-ink"
          }`}
        >
          {note.title}
        </button>
      )}
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {arranged && (
          <button
            onClick={() => void update(note.id, { status: "active" })}
            aria-label="还原便签"
            title="还原为未安排便签"
            className="rounded p-0.5 text-ink-3 hover:bg-warn/10 hover:text-warn"
          >
            <RotateCcw size={14} />
          </button>
        )}
        {!arranged && (
          <button
            onClick={() => void complete(note.id)}
            aria-label="完成便签"
            title="完成（保留历史）"
            className="rounded p-0.5 text-ink-3 hover:bg-success/10 hover:text-success"
          >
            <Check size={14} />
          </button>
        )}
        <button
          onClick={() => void remove(note.id)}
          aria-label="删除便签"
          title="删除"
          className="rounded p-0.5 text-ink-3 hover:bg-error/10 hover:text-error"
        >
          <X size={14} />
        </button>
      </span>
    </li>
  );
}

/**
 * 便签区（今日左栏持久区域）：
 * 「暂时没安排时间，但不能忘记」的待办事项，独立于日期持久存在。
 * 快速添加 + 双击编辑 + hover 完成/删除 + 空状态。
 */
export default function NoteList() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const notes = useNoteStore((s) => s.notes);
  const create = useNoteStore((s) => s.create);
  const load = useNoteStore((s) => s.load);
  const clearArranged = useNoteStore((s) => s.clearArranged);
  const convertToNote = useTaskStore((s) => s.convertToNote);
  const [draft, setDraft] = useState("");
  const [showArranged, setShowArranged] = useState(false);
  const [taskOver, setTaskOver] = useState(false);

  const activeNotes = notes.filter((n) => n.status !== "arranged");
  const arrangedNotes = notes.filter((n) => n.status === "arranged");

  useEffect(() => {
    if (dbStatus === "ready") {
      void load();
    }
  }, [dbStatus, load]);

  // 任务 → 便签 反向拖拽：注册 drop 回调 + 悬停高亮
  useEffect(() => {
    taskToNoteDropCallbacks.notelist = (taskId) => {
      void convertToNote(taskId);
    };
    return () => {
      delete taskToNoteDropCallbacks.notelist;
    };
  }, [convertToNote]);

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      setTaskOver(
        taskToNoteDrag.taskId != null &&
          noteDropZoneAt(ev.clientX, ev.clientY) === "notelist",
      );
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const canSubmit = draft.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    await create({ title: draft.trim() });
    setDraft("");
  };

  return (
    <div
      data-note-drop="notelist"
      className={`rounded-md border-t border-line pt-2 transition-shadow ${
        taskOver ? "shadow-[inset_0_0_0_2px_#f59e0b66]" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1 text-xs text-ink-2">
        <StickyNote size={12} className="text-warn" />
        <span className="font-medium">便签</span>
        <span className="truncate text-ink-3">暂时没安排时间，但不能忘记</span>
      </div>

      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="记下想法，回车保存"
          className="min-w-0 flex-1 rounded-md border border-line-strong px-2 py-1 text-xs"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="flex shrink-0 items-center justify-center rounded-md bg-brand px-1.5 py-1 text-white hover:bg-neutral-700 disabled:bg-line"
          aria-label="添加便签"
        >
          <Plus size={14} />
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong p-4 text-center text-xs text-ink-3">
          还没有便签，把想法记下来
        </p>
      ) : (
        <>
          {activeNotes.length > 0 && (
            <ul className="space-y-1">
              {activeNotes.map((n) => (
                <NoteItem key={n.id} note={n} />
              ))}
            </ul>
          )}
          {activeNotes.length === 0 && arrangedNotes.length > 0 && (
            <p className="pb-1 text-center text-[11px] text-ink-3">便签都已安排为任务</p>
          )}

          {/* 已安排便签：默认折叠，可展开逐项还原/删除，或一键清理（可撤销） */}
          {arrangedNotes.length > 0 && (
            <div className="mt-1.5 border-t border-dashed border-line pt-1.5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowArranged((v) => !v)}
                  className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2"
                >
                  <span className="inline-block w-3 text-center">
                    {showArranged ? "▾" : "▸"}
                  </span>
                  已安排（{arrangedNotes.length}）
                </button>
                {showArranged && (
                  <button
                    onClick={() => void clearArranged()}
                    className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink-2"
                  >
                    全部清理
                  </button>
                )}
              </div>
              {showArranged && (
                <ul className="mt-1 space-y-1">
                  {arrangedNotes.map((n) => (
                    <NoteItem key={n.id} note={n} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
