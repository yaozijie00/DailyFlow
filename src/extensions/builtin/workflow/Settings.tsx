import { useState } from "react";
import {
  getWorkflowPreferences,
  saveWorkflowPreferences,
} from "./preferences";

export default function WorkflowSettings() {
  const [preferences, setPreferences] = useState(getWorkflowPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleOpenAfterCreate = async () => {
    const next = {
      ...preferences,
      openEditorAfterCreate: !preferences.openEditorAfterCreate,
    };
    setSaving(true);
    setError(null);
    try {
      await saveWorkflowPreferences(next);
      setPreferences(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存 Workflow 偏好失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border-subtle glass-surface p-5">
      <div className="flex items-center justify-between gap-5">
        <div>
          <div className="text-sm font-medium text-text-primary">创建后自动打开编辑器</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            关闭后，创建 Workflow 会停留在列表，便于连续添加多个流程。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={preferences.openEditorAfterCreate}
          aria-label="创建后自动打开编辑器"
          disabled={saving}
          onClick={() => void toggleOpenAfterCreate()}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            preferences.openEditorAfterCreate ? "bg-accent" : "bg-surface-muted"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              preferences.openEditorAfterCreate ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>
      {saving && <p className="mt-3 text-xs text-text-faint">正在保存…</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
