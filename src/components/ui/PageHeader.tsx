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
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-neutral-900">
          {title}
        </h1>
        {description != null && (
          <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-500">
            {description}
          </div>
        )}
      </div>
      {actions != null && (
        <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
      )}
    </header>
  );
}
