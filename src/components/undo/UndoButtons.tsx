import { useSyncExternalStore } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { undoManager } from "../../lib/undoManager";
import { useAppStore } from "../../stores/appStore";

/**
 * 全局撤销/重做按钮（v1.6）：
 * - 无历史时禁用；Undo 后 Redo 自动启用；
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
  const pushToast = useAppStore((s) => s.pushToast);

  const onUndo = () => {
    void undoManager.undo().catch(() => pushToast("error", "撤销失败"));
  };
  const onRedo = () => {
    void undoManager.redo().catch(() => pushToast("error", "重做失败"));
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="撤销"
        title="撤销（Ctrl+Z）"
        className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30"
      >
        <Undo2 size={14} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="重做"
        title="重做（Ctrl+Shift+Z / Ctrl+Y）"
        className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
