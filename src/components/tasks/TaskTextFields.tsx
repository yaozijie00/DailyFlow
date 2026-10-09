export function TaskTitleField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?:boolean }) {
  return <label className="grid gap-2 text-sm text-text-secondary">任务名称<input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} required maxLength={500} className="min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-text-primary" /></label>;
}
export function TaskNotesField({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?:boolean }) {
  return <label className="grid gap-2 text-sm text-text-secondary">说明与完成标准<textarea disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder="说明要做什么、怎样算完成…" className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-text-primary" /></label>;
}
