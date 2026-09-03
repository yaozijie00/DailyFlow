import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`w-full rounded-md border border-line-strong px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3 ${className}`}
      {...rest}
    />
  );
}
