import { useWindowDrag } from "./useWindowDrag";
import {
  taskToNoteDrag,
  taskToNoteDropCallbacks,
  noteDropZoneAt,
} from "../lib/noteConvert";

/**
 * 任务 → 便签 拖拽源（V2 Phase 3）：
 * 供任务列表行 / 时间轴块上的「转便签」手柄使用。
 * mousedown 拖动 → 写入 taskToNoteDrag.taskId；松手若落在便签区（notelist）
 * 则触发便签区注册的 drop 回调（convertToNote），否则取消。
 */
export function useTaskToNoteDrag() {
  const { start } = useWindowDrag();

  return (e: React.MouseEvent, taskId: number) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    start(
      {
        onMove: (ev) => {
          if (!dragging) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) <= 4) return;
            dragging = true;
            taskToNoteDrag.taskId = taskId;
          }
        },
        onUp: (ev) => {
          if (!dragging) return;
          if (noteDropZoneAt(ev.clientX, ev.clientY) === "notelist") {
            taskToNoteDropCallbacks.notelist?.(taskId);
          }
          taskToNoteDrag.taskId = null;
        },
      },
      () => {
        taskToNoteDrag.taskId = null;
      },
    );
  };
}
