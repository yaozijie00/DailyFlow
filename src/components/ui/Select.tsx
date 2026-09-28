import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`df-control rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-body text-text-primary outline-none transition-colors hover:enabled:border-text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-faint ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
