import { Trophy } from "lucide-react";
import { useAppStore } from "../stores/appStore";

const STYLE: Record<string, string> = {
  info: "border-neutral-300 bg-white text-neutral-800",
  success: "border-green-300 bg-green-50 text-green-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  error: "border-red-300 bg-red-50 text-red-800",
};

/** 全局轻提示（右上角），由 appStore.pushToast / pushAchievement 触发。 */
export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  const achievementToasts = useAppStore((s) => s.achievementToasts);
  const removeAchievementToast = useAppStore((s) => s.removeAchievementToast);

  if (toasts.length === 0 && achievementToasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
      {achievementToasts.map((t) => (
        <div
          key={`a-${t.id}`}
          className="pointer-events-auto flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm shadow-sm"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700">
            <Trophy size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-amber-600">成就解锁</div>
            <div className="font-medium text-amber-900">{t.name}</div>
            <div className="text-xs text-amber-700/80">{t.description}</div>
          </div>
          <button
            onClick={() => removeAchievementToast(t.id)}
            className="shrink-0 text-amber-400 hover:text-amber-600"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      ))}

      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-sm ${STYLE[t.type] ?? STYLE.info}`}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.onClick();
                removeToast(t.id);
              }}
              className="shrink-0 font-medium underline underline-offset-2 hover:opacity-70"
            >
              {t.action.label}
            </button>
          )}
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
