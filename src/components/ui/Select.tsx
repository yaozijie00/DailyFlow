import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`rounded-md border border-line-strong px-2 py-1.5 text-sm text-ink outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
