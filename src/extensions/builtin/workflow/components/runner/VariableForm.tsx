import type { WorkflowVariableDefinition, WorkflowVariableValues } from "../../domain/types";

const inputClass = "min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text-primary outline-none transition-shadow placeholder:text-text-faint focus:border-accent focus:ring-2 focus:ring-accent/15";

export function VariableForm({ definitions, values, errors, onChange }: {
  definitions: WorkflowVariableDefinition[];
  values: WorkflowVariableValues;
  errors: Record<string, string>;
  onChange: (key: string, value: string | number | boolean | null) => void;
}) {
  if (definitions.length === 0) {
    return <p className="rounded-xl border border-dashed border-border-strong p-5 text-sm text-text-muted">此模板无需填写变量，可以直接预览。</p>;
  }
  return (
    <div className="space-y-4">
      {definitions.map((definition) => {
        const id = `workflow-variable-${definition.key}`;
        const value = values[definition.key] ?? "";
        const describedBy = `${id}-help${errors[definition.key] ? ` ${id}-error` : ""}`;
        return (
          <div key={definition.key}>
            <label htmlFor={id} className="mb-1.5 flex items-center gap-1 text-sm font-medium text-text-secondary">
              {definition.label}
              {definition.required && <span className="text-danger" aria-label="必填">*</span>}
            </label>
            {definition.type === "textarea" ? (
              <textarea id={id} rows={4} value={String(value)} aria-invalid={Boolean(errors[definition.key])} aria-describedby={describedBy} onChange={(event) => onChange(definition.key, event.target.value)} className={`${inputClass} resize-y py-2.5`} />
            ) : definition.type === "boolean" ? (
              <button id={id} type="button" role="switch" aria-checked={value === true} aria-describedby={describedBy} onClick={() => onChange(definition.key, value !== true)} className={`relative h-7 w-12 cursor-pointer rounded-full transition-colors ${value === true ? "bg-accent" : "bg-surface-muted"}`}>
                <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform ${value === true ? "left-6" : "left-1"}`} />
              </button>
            ) : definition.type === "select" ? (
              <select id={id} value={String(value)} aria-invalid={Boolean(errors[definition.key])} aria-describedby={describedBy} onChange={(event) => onChange(definition.key, event.target.value)} className={inputClass}>
                <option value="">请选择</option>
                {(definition.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                id={id}
                type={definition.type === "number" ? "number" : definition.type === "date" ? "date" : "text"}
                inputMode={definition.type === "number" ? "decimal" : undefined}
                value={String(value)}
                aria-invalid={Boolean(errors[definition.key])}
                aria-describedby={describedBy}
                placeholder={definition.type === "file" ? "选择或输入文件的绝对路径" : definition.type === "folder" ? "选择或输入文件夹的绝对路径" : undefined}
                onChange={(event) => onChange(definition.key, definition.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)}
                className={inputClass}
              />
            )}
            <p id={`${id}-help`} className="mt-1 text-xs leading-5 text-text-faint">{definition.description ?? (definition.remember ? "可在设置允许时记住此值" : " ")}</p>
            {errors[definition.key] && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">{errors[definition.key]}</p>}
          </div>
        );
      })}
    </div>
  );
}
