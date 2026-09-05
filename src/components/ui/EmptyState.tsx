import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** 统一空状态：柔和虚线卡 + 图标圆底，明确下一步。 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface/60 px-8 py-12 text-center">
      {icon != null && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-faint">
          {icon}
        </div>
      )}
      <div className="text-base font-medium text-text-secondary">{title}</div>
      {description != null && (
        <p className="max-w-sm text-sm leading-relaxed text-text-faint">{description}</p>
      )}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}
