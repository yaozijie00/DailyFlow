export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "出错了", message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <div className="font-medium">{title}</div>
      {message != null && <div className="mt-1 text-xs text-red-600">{message}</div>}
      {onRetry != null && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
        >
          重试
        </button>
      )}
    </div>
  );
}
