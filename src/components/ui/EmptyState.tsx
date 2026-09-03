import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 p-10 text-center">
      {icon != null && <div className="text-neutral-300">{icon}</div>}
      <div className="text-sm font-medium text-neutral-600">{title}</div>
      {description != null && <p className="text-sm text-neutral-400">{description}</p>}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}
