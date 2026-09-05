import type { ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 无障碍标签（同时作为 hover 提示）。 */
  label: string;
}

export function IconButton({ label, className = "", children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
