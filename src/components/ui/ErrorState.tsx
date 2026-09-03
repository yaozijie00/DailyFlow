export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "出错了", message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-md border border-error/40 bg-error/10 p-4 text-sm text-error">
      <div className="font-medium">{title}</div>
      {message != null && <div className="mt-1 text-xs text-error">{message}</div>}
      {onRetry != null && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
        >
          重试
        </button>
      )}
    </div>
  );
}
