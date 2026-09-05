import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`rounded-[var(--radius-control)] border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-faint ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
