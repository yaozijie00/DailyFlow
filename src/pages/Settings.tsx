import { useEffect, useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "../stores/settingsStore";
import { exportBackup, listBackups, restoreBackup } from "../services/backupService";

const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0..24
const SNAP_OPTIONS = [5, 10, 15, 30, 60];

interface Draft {
  pomodoroMinutes: number;
  startHour: number;
  endHour: number;
  snapMinutes: number;
}

/** 设置页：V1 仅四个设置项，保存后持久化到 SQLite（重启保持）。 */
export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const loaded = useSettingsStore((s) => s.loaded);
  const update = useSettingsStore((s) => s.update);

  const [draft, setDraft] = useState<Draft>({
    pomodoroMinutes: settings.pomodoroDurationMinutes,
    startHour: Math.floor(settings.timelineStartMinutes / 60),
    endHour: Math.floor(settings.timelineEndMinutes / 60),
    snapMinutes: settings.timelineSnapMinutes,
  });
  const [saved, setSaved] = useState(false);
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // —— 数据备份 / 恢复 ——
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
    if (loaded) refreshBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const handleExport = async () => {
    setBusy(true);
    setDataMsg(null);
    try {
      const path = await exportBackup();
      setDataMsg({ type: "ok", text: `备份成功：${path}` });
      await refreshBackups();
    } catch (e) {
      setDataMsg({ type: "error", text: `备份失败：${(e as Error).message}` });
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
      setDataMsg({ type: "error", text: `恢复失败：${(e as Error).message}` });
      setBusy(false);
      setConfirming(false);
    }
  };

  useEffect(() => {
    if (loaded) {
      setDraft({
        pomodoroMinutes: settings.pomodoroDurationMinutes,
        startHour: Math.floor(settings.timelineStartMinutes / 60),
        endHour: Math.floor(settings.timelineEndMinutes / 60),
        snapMinutes: settings.timelineSnapMinutes,
      });
    }
  }, [loaded, settings]);

  if (!loaded) {
    return (
      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="mt-2 text-sm text-neutral-500">加载中…</p>
      </div>
    );
  }

  const handleSave = async () => {
    await update({
      pomodoroDurationMinutes: draft.pomodoroMinutes,
      timelineStartMinutes: draft.startHour * 60,
      timelineEndMinutes: draft.endHour * 60,
      timelineSnapMinutes: draft.snapMinutes,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-md">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-neutral-500">修改后立即保存到本地数据库，重启后依然生效。</p>
        <p className="mt-1 text-xs text-neutral-400">DailyFlow 版本 {appVersion || "…"}</p>
      </header>

      <div className="space-y-4 rounded-md border border-neutral-200 bg-white p-5">
        {/* 番茄钟默认时长 */}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="pomodoro" className="text-sm text-neutral-700">
            番茄钟默认时长
          </label>
          <div className="flex items-center gap-2">
            <input
              id="pomodoro"
              type="number"
              min={1}
              max={180}
              value={draft.pomodoroMinutes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pomodoroMinutes: Number(e.target.value) }))
              }
              className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <span className="text-sm text-neutral-500">分钟</span>
          </div>
        </div>

        {/* 时间轴开始时间 */}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="start" className="text-sm text-neutral-700">
            时间轴开始时间
          </label>
          <select
            id="start"
            value={draft.startHour}
            onChange={(e) =>
              setDraft((d) => ({ ...d, startHour: Number(e.target.value) }))
            }
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {HOURS.filter((h) => h <= 23).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>

        {/* 时间轴结束时间 */}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="end" className="text-sm text-neutral-700">
            时间轴结束时间
          </label>
          <select
            id="end"
            value={draft.endHour}
            onChange={(e) =>
              setDraft((d) => ({ ...d, endHour: Number(e.target.value) }))
            }
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {HOURS.filter((h) => h >= 1).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>

        {/* 时间轴吸附粒度 */}
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="snap" className="text-sm text-neutral-700">
            时间轴吸附粒度
          </label>
          <select
            id="snap"
            value={draft.snapMinutes}
            onChange={(e) =>
              setDraft((d) => ({ ...d, snapMinutes: Number(e.target.value) }))
            }
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {SNAP_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} 分钟
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            保存
          </button>
          {saved && <span className="text-sm text-green-600">已保存</span>}
        </div>
      </div>

      {/* 数据：备份 / 恢复 */}
      <div className="mt-6 space-y-4 rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold">数据</h2>

        {/* 导出备份 */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-neutral-700">导出备份</div>
            <div className="text-xs text-neutral-400">
              生成 DailyFlow_Backup_YYYY-MM-DD.db（SQLite 完整快照）
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={busy}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:bg-neutral-300"
          >
            <Download size={14} /> 导出备份
          </button>
        </div>

        {/* 恢复备份 */}
        <div className="border-t border-neutral-100 pt-4">
          <div className="text-sm text-neutral-700">恢复备份</div>
          <div className="mt-1 text-xs text-neutral-400">
            从本地备份中选择一个文件恢复。恢复前会自动备份当前数据；备份版本与当前应用不一致时拒绝恢复。
          </div>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={selectedBackup}
              onChange={(e) => {
                setSelectedBackup(e.target.value);
                setConfirming(false);
              }}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
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
              className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              <Upload size={14} /> 恢复
            </button>
          </div>

          {confirming && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-500 disabled:bg-amber-300"
                >
                  {busy ? "恢复中…" : "确认恢复"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {dataMsg && (
            <p
              className={`mt-3 text-xs ${
                dataMsg.type === "ok" ? "text-green-600" : "text-red-600"
              }`}
            >
              {dataMsg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
