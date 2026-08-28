import { useAppStore } from "../stores/appStore";

const STYLE: Record<string, string> = {
  info: "border-neutral-300 bg-white text-neutral-800",
  success: "border-green-300 bg-green-50 text-green-800",
  error: "border-red-300 bg-red-50 text-red-800",
};

/** 全局轻提示（右上角），由 appStore.pushToast 触发。 */
export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-sm ${STYLE[t.type] ?? STYLE.info}`}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 text-neutral-400 hover:text-neutral-600"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
