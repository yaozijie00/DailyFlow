import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text-secondary hover:bg-surface-hover",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-text-muted hover:bg-surface-hover hover:text-text-primary",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[var(--control-height-sm)] px-3 py-1 text-caption",
  md: "df-control px-4 py-2 text-body",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  loading = false,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
