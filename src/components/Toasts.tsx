import { motion, AnimatePresence } from "motion/react";
import { Trophy } from "lucide-react";
import { useAppStore } from "../stores/appStore";

const STYLE: Record<string, string> = {
  info: "border-border-subtle glass-surface text-text-secondary",
  success: "border-success/40 bg-success-soft text-success",
  warning: "border-warning/40 bg-warning-soft text-warning",
  error: "border-danger/40 bg-danger-soft text-danger",
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
      <AnimatePresence initial={false}>
        {achievementToasts.map((t) => (
          <motion.div
            key={`a-${t.id}`}
            layout
            initial={{ opacity: 0, y: -18, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm shadow-card"
          >
            <motion.span
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 15, delay: 0.05 }}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning"
            >
              <Trophy size={16} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-warning">成就解锁</div>
              <div className="font-medium text-text-primary">{t.name}</div>
              <div className="text-xs text-text-muted">{t.description}</div>
            </div>
            <button
              onClick={() => removeAchievementToast(t.id)}
              className="shrink-0 text-text-faint hover:text-text-muted"
              aria-label="关闭"
            >
              ×
            </button>
          </motion.div>
        ))}

        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className={`pointer-events-auto flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm shadow-card ${STYLE[t.type] ?? STYLE.info}`}
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
              className="shrink-0 text-text-faint hover:text-text-muted"
              aria-label="关闭"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
