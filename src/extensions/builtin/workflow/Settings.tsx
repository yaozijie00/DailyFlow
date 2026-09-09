import { useState } from "react";
import {
  getWorkflowPreferences,
  saveWorkflowPreferences,
} from "./preferences";

export default function WorkflowSettings() {
  const [preferences, setPreferences] = useState(getWorkflowPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: typeof preferences) => {
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

  const toggle = (key: "openEditorAfterCreate" | "enableCommandNodes" | "rememberNonSensitiveVariables") =>
    save({ ...preferences, [key]: !preferences[key] });

  return (
    <div className="space-y-5 rounded-xl border border-border-subtle glass-surface p-5">
      <PreferenceSwitch
        label="创建后自动打开编辑器"
        description="关闭后，创建 Workflow 会停留在模板库，便于连续添加。"
        checked={preferences.openEditorAfterCreate}
        disabled={saving}
        onClick={() => void toggle("openEditorAfterCreate")}
      />
      <PreferenceSwitch
        label="启用命令节点"
        description="允许模板执行受控命令。运行前仍会显示影响预览并要求二次确认。"
        checked={preferences.enableCommandNodes}
        disabled={saving}
        onClick={() => void toggle("enableCommandNodes")}
      />
      <PreferenceSwitch
        label="记住非敏感变量"
        description="仅记住模板明确允许保存的普通变量；敏感变量始终不会保存。"
        checked={preferences.rememberNonSensitiveVariables}
        disabled={saving}
        onClick={() => void toggle("rememberNonSensitiveVariables")}
      />
      <label className="flex items-center justify-between gap-5">
        <div>
          <div className="text-sm font-medium text-text-primary">默认文件冲突策略</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">新建文件节点时采用的默认处理方式。</p>
        </div>
        <select
          aria-label="默认文件冲突策略"
          value={preferences.defaultFileConflict}
          disabled={saving}
          onChange={(event) => void save({ ...preferences, defaultFileConflict: event.target.value as typeof preferences.defaultFileConflict })}
          className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary"
        >
          <option value="fail">遇到冲突时报错</option>
          <option value="skip">跳过已存在文件</option>
          <option value="rename">自动重命名</option>
          <option value="overwrite">覆盖文件</option>
        </select>
      </label>
      {saving && <p className="mt-3 text-xs text-text-faint">正在保存…</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PreferenceSwitch({ label, description, checked, disabled, onClick }: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onClick} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-accent" : "bg-surface-muted"}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "left-6" : "left-1"}`} />
      </button>
    </div>
  );
}
