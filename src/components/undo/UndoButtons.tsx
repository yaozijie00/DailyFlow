import { useSyncExternalStore } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { undoManager } from "../../lib/undoManager";
import { performUndo, performRedo } from "../../lib/undoActions";

/**
 * 全局撤销/重做按钮（v1.6）：
 * - 无历史时禁用；Undo 后 Redo 自动启用；
 * - 成功后刷新受影响 Store 并 Toast「已撤销/已重做：…」；
 * - 失败时不移动栈并 Toast 提示，数据保持不变。
 */
export default function UndoButtons() {
  const snapshot = useSyncExternalStore(
    (cb) => undoManager.subscribe(cb),
    () => undoManager.undoSize + undoManager.redoSize,
  );
  void snapshot; // 订阅变化触发重渲染
  const canUndo = undoManager.canUndo();
  const canRedo = undoManager.canRedo();
  const undoTitle = undoManager.lastLabel
    ? `撤销：${undoManager.lastLabel}（Ctrl+Z）`
    : "撤销（Ctrl+Z）";

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => void performUndo()}
        disabled={!canUndo}
        aria-label="撤销"
        title={undoTitle}
        className="rounded p-1 text-ink-2 transition-colors hover:bg-canvas disabled:opacity-30"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={() => void performRedo()}
        disabled={!canRedo}
        aria-label="重做"
        title="重做（Ctrl+Shift+Z / Ctrl+Y）"
        className="rounded p-1 text-ink-2 transition-colors hover:bg-canvas disabled:opacity-30"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
