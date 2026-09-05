export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "出错了", message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      <div className="font-medium">{title}</div>
      {message != null && <div className="mt-1 text-xs opacity-80">{message}</div>}
      {onRetry != null && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md border border-danger/40 px-3 py-1.5 text-xs transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
        >
          重试
        </button>
      )}
    </div>
  );
}
