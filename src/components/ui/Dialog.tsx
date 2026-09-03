import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 底部操作区（如取消/确认按钮）。 */
  footer?: ReactNode;
  /** 点击遮罩是否关闭（默认 true）。 */
  closeOnBackdrop?: boolean;
}

/**
 * 轻量模态对话框：
 * - ESC 关闭、点击遮罩关闭、右上角关闭按钮；
 * - 打开时聚焦面板内首个可聚焦元素（或 [autofocus]），保证键盘可用。
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel) {
      const autofocus = panel.querySelector<HTMLElement>("[autofocus]");
      const focusable = panel.querySelector<HTMLElement>(
        "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])",
      );
      (autofocus ?? focusable ?? panel).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/30"
          >
            <X size={18} />
          </button>
        </div>
        {children}
        {footer != null && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
