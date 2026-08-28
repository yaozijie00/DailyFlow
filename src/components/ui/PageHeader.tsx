import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  /** 可选的说明文字（可包含多行/次要信息）。 */
  description?: ReactNode;
  /** 右侧操作区（按钮等）。 */
  actions?: ReactNode;
}

/** 统一页面头部：标题 + 可选说明 + 右侧操作。 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        {description != null && (
          <div className="mt-0.5 text-sm text-neutral-500">{description}</div>
        )}
      </div>
      {actions != null && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
