import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`df-control w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-body text-text-primary outline-none transition-colors placeholder:text-text-muted hover:enabled:border-text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-faint ${className}`}
      {...rest}
    />
  );
}
