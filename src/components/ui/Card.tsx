import type { HTMLAttributes, ReactNode } from "react";

/**
 * 统一卡片容器（V2.4 三主题语义类）：
 * 收敛全站高频内联写法 `rounded-md border border-neutral-200 bg-white p-*`，
 * 以 bg-surface / border-subtle / shadow-card 语义类随主题（浅/深/毛玻璃）自适应。
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 内边距：默认 p-4（紧凑）| p-5（区块标题卡片）| none */
  padding?: "md" | "lg" | "none";
  /** 点击型卡片（含 hover 反馈；不自动附加 onClick） */
  interactive?: boolean;
  /** 玻璃主题下是否启用磨砂表面（默认启用；密集数据区可关闭保可读） */
  glass?: boolean;
}

export function Card({
  padding = "md",
  interactive = false,
  glass = true,
  className = "",
  children,
  ...rest
}: CardProps) {
  const pad = padding === "none" ? "" : padding === "lg" ? "p-5" : "p-4";
  return (
    <div
      className={[
        glass
          ? "glass-surface border border-border-subtle"
          : "border border-border-subtle bg-surface",
        "rounded-[var(--radius-card)]",
        pad,
        interactive ? "transition-colors hover:bg-surface-hover" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 卡片区块标题行（标题 + 右侧操作，Statistics/课程等卡片头部统一）。 */
export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-text-secondary">{title}</h2>
        {subtitle != null && (
          <div className="mt-0.5 text-xs text-text-faint">{subtitle}</div>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
