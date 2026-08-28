import type { SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={`rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/30 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
