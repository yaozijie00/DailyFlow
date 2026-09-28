import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  /** 可选的说明文字（可包含多行/次要信息）。 */
  description?: ReactNode;
  /** 右侧操作区（按钮等）。 */
  actions?: ReactNode;
}

/** 统一页面头部：标题 + 可选说明 + 右侧操作（全站一致层级与间距）。 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page font-semibold leading-tight tracking-[-0.02em] text-text-primary">
          {title}
        </h1>
        {description != null && (
          <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-muted">
            {description}
          </div>
        )}
      </div>
      {actions != null && (
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
          {actions}
        </div>
      )}
    </header>
  );
}
