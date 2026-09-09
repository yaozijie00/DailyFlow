import { useEffect, useState, type RefObject } from "react";
import type { Task, UpdateTaskInput } from "../../db/repositories/taskRepository";
import type { Note } from "../../db/repositories/noteRepository";
import {
  convertNoteToTask,
  noteDragSession,
  noteDropCallbacks,
  noteDropZoneAt,
} from "../../lib/noteConvert";
import { dragRangeToTimes, type TimelineConfig } from "../../lib/timeline";
import { undoManager } from "../../lib/undoManager";

const NOTE_DEFAULT_MINUTES = 60;

export interface ExternalDropPreview {
  taskId: number;
  startMs: number;
  endMs: number;
}

interface UseTimelineExternalDropsOptions {
  taskAreaRef: RefObject<HTMLDivElement | null>;
  tasks: Task[];
  taskDrag: { taskId: number } | null;
  notes: Note[];
  selectedDate: string;
  config: TimelineConfig;
  pxPerMinute: number;
  updateTask: (id: number, input: UpdateTaskInput) => Promise<boolean>;
  createTask: Parameters<typeof convertNoteToTask>[2];
  updateNote: Parameters<typeof convertNoteToTask>[3];
  endTaskDrag: () => void;
}

export function useTimelineExternalDrops({
  taskAreaRef,
  tasks,
  taskDrag,
  notes,
  selectedDate,
  config,
  pxPerMinute,
  updateTask,
  createTask,
  updateNote,
  endTaskDrag,
}: UseTimelineExternalDropsOptions) {
  const [dropPreview, setDropPreview] = useState<ExternalDropPreview | null>(null);
  const [notePreview, setNotePreview] = useState<{
    startMs: number;
    endMs: number;
    title?: string;
  } | null>(null);

  useEffect(() => {
    if (!taskDrag) {
      setDropPreview(null);
      return;
    }
    const area = taskAreaRef.current;
    const task = tasks.find((candidate) => candidate.id === taskDrag.taskId);
    if (!area || !task) return;
    const durationMs =
      task.estimatedDuration != null && task.estimatedDuration > 0
        ? task.estimatedDuration * 1000
        : config.snapMinutes * 60_000;
    const isInside = (event: MouseEvent) => {
      const rect = area.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    };
    const startAt = (event: MouseEvent) =>
      dragRangeToTimes(
        event.clientY - area.getBoundingClientRect().top,
        event.clientY - area.getBoundingClientRect().top,
        config,
        pxPerMinute,
      ).startMs;
    const onMove = (event: MouseEvent) => {
      if (!isInside(event)) {
        setDropPreview(null);
        return;
      }
      const startMs = startAt(event);
      setDropPreview({ taskId: task.id, startMs, endMs: startMs + durationMs });
    };
    const onUp = (event: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (isInside(event)) {
        const startMs = startAt(event);
        void updateTask(task.id, {
          plannedStart: startMs,
          plannedEnd: startMs + durationMs,
        });
      }
      endTaskDrag();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [taskDrag, tasks, updateTask, endTaskDrag, config, pxPerMinute, taskAreaRef]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const area = taskAreaRef.current;
      if (noteDragSession.noteId == null || !area) {
        setNotePreview(null);
        return;
      }
      if (noteDropZoneAt(event.clientX, event.clientY) !== "timeline") {
        setNotePreview(null);
        return;
      }
      const y = event.clientY - area.getBoundingClientRect().top;
      const startMs = dragRangeToTimes(y, y, config, pxPerMinute).startMs;
      const note = notes.find((candidate) => candidate.id === noteDragSession.noteId);
      setNotePreview({
        startMs,
        endMs: startMs + NOTE_DEFAULT_MINUTES * 60_000,
        title: note?.title,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [notes, config, pxPerMinute, taskAreaRef]);

  useEffect(() => {
    noteDropCallbacks.timeline = (noteId, _clientX, clientY) => {
      setNotePreview(null);
      const area = taskAreaRef.current;
      if (!area) return;
      const y = clientY - area.getBoundingClientRect().top;
      const startMs = dragRangeToTimes(y, y, config, pxPerMinute).startMs;
      const endMs = startMs + NOTE_DEFAULT_MINUTES * 60_000;
      void undoManager.withBatchAsync(() =>
        convertNoteToTask(noteId, notes, createTask, updateNote, {
          scheduledDate: selectedDate,
          plannedStart: startMs,
          plannedEnd: endMs,
        }),
      );
    };
    return () => {
      delete noteDropCallbacks.timeline;
    };
  }, [notes, createTask, updateNote, selectedDate, config, pxPerMinute, taskAreaRef]);

  return { dropPreview, notePreview };
}

