export function LoadingState({ text = "加载中…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
      />
      {text}
    </div>
  );
}
