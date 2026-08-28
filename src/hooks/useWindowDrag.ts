import { useCallback, useEffect, useRef } from "react";

export interface WindowDragHandlers {
  onMove: (e: MouseEvent) => void;
  onUp: (e: MouseEvent) => void;
}

interface ActiveDrag {
  cleanup: () => void;
  abortState: () => void;
}

/**
 * 管理「mousedown 后在 window 上监听 mousemove/mouseup」的拖拽生命周期：
 * - start(handlers, abortState)：开始拖拽并挂载 window 监听器；
 * - mouseup 自动结束并移除监听器；
 * - 组件卸载（仅移除监听器）或窗口失焦（清理预览状态 + 移除监听器）时自动中止，
 *   避免监听器泄漏与「失焦后残留 mouseup 用过期坐标触发操作」（M2）。
 */
export function useWindowDrag() {
  const activeRef = useRef<ActiveDrag | null>(null);

  const start = useCallback(
    (handlers: WindowDragHandlers, abortState: () => void) => {
      activeRef.current?.cleanup(); // 上一个拖拽若未结束先清理
      const handleMove = (e: MouseEvent) => handlers.onMove(e);
      const handleUp = (e: MouseEvent) => {
        handlers.onUp(e);
        activeRef.current?.cleanup();
        activeRef.current = null;
      };
      const cleanup = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      activeRef.current = { cleanup, abortState };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [],
  );

  useEffect(() => {
    const onBlur = () => {
      const active = activeRef.current;
      if (!active) return;
      active.abortState(); // 清理预览/拖拽状态
      active.cleanup(); // 移除监听器，避免残留
      activeRef.current = null;
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      activeRef.current?.cleanup(); // 卸载时只移除监听器，不触碰组件状态
      activeRef.current = null;
    };
  }, []);

  return { start };
}
