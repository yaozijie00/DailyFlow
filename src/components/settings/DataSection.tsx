import { useEffect, useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { exportBackup, listBackups, restoreBackup } from "../../services/backupService";

export default function DataSection() {
  const [backups, setBackups] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataMsg, setDataMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refreshBackups = async () => {
    try {
      const files = await listBackups();
      setBackups(files);
      if (files.length > 0 && !files.includes(selectedBackup)) {
        setSelectedBackup(files[files.length - 1]); // 升序，取最新
      }
    } catch {
      setBackups([]);
    }
  };

  useEffect(() => {
    void refreshBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async () => {
    setBusy(true);
    setDataMsg(null);
    try {
      const path = await exportBackup();
      setDataMsg({ type: "ok", text: `备份成功：${path}` });
      await refreshBackups();
    } catch (e) {
      setDataMsg({ type: "error", text: `备份失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setDataMsg(null);
    try {
      // 成功后会重载应用，此后的代码不会执行
      await restoreBackup(selectedBackup);
    } catch (e) {
      setDataMsg({ type: "error", text: `恢复失败：${String(e)}` });
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="mt-6 space-y-4 rounded-md border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">数据</h2>

      {/* 导出备份 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-ink">导出备份</div>
          <div className="text-xs text-ink-3">
            生成 DailyFlow_Backup_YYYY-MM-DD.db（SQLite 完整快照）
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={busy}
          className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:bg-line"
        >
          <Download size={14} /> 导出备份
        </button>
      </div>

      {/* 恢复备份 */}
      <div className="border-t border-line-soft pt-4">
        <div className="text-sm text-ink">恢复备份</div>
        <div className="mt-1 text-xs text-ink-3">
          从本地备份中选择一个文件恢复。恢复前会自动备份当前数据；备份版本与当前应用不一致时拒绝恢复。
        </div>

        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedBackup}
            onChange={(e) => {
              setSelectedBackup(e.target.value);
              setConfirming(false);
            }}
            className="min-w-0 flex-1 rounded-md border border-line-strong px-2 py-1.5 text-sm"
          >
            {backups.length === 0 && <option value="">暂无备份文件</option>}
            {backups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setConfirming(true)}
            disabled={busy || !selectedBackup}
            className="flex items-center gap-1 rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3"
          >
            <Upload size={14} /> 恢复
          </button>
        </div>

        {confirming && (
          <div className="mt-3 rounded-md border border-warn/50 bg-warn/10 p-3 text-sm text-warn">
            <div className="flex items-center gap-1 font-medium">
              <ShieldCheck size={14} /> 确认恢复
            </div>
            <p className="mt-1 text-xs">
              将用「{selectedBackup}」覆盖当前数据。恢复前会自动备份当前数据库
              （DailyFlow_BeforeRestore_*.db），但恢复本身不可撤销。确定继续？
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleRestore}
                disabled={busy}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-warn/100 disabled:bg-amber-300"
              >
                {busy ? "恢复中…" : "确认恢复"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink hover:bg-canvas"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {dataMsg && (
          <p
            className={`mt-3 text-xs ${
              dataMsg.type === "ok" ? "text-success" : "text-error"
            }`}
          >
            {dataMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
