import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { validateStoragePaths } from "../../lib/storagePaths";

interface StoragePaths {
  dataDir: string;
  cacheDir: string;
  backupDir: string;
}

const EMPTY: StoragePaths = { dataDir: "", cacheDir: "", backupDir: "" };

export default function StorageSection() {
  const [paths, setPaths] = useState<StoragePaths>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    invoke<StoragePaths>("get_storage_paths")
      .then((p) => {
        // 始终展示后端返回的有效路径；用户清空输入框即使用默认
        setPaths({
          dataDir: p.dataDir,
          cacheDir: p.cacheDir,
          backupDir: p.backupDir,
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const errs = validateStoragePaths(paths);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await invoke("set_storage_paths", {
        dataDir: paths.dataDir,
        cacheDir: paths.cacheDir,
        backupDir: paths.backupDir,
      });
      setMsg({ type: "ok", text: "新的数据位置将在重新启动DailyFlow后生效" });
    } catch (e) {
      setMsg({ type: "error", text: `保存失败：${String(e)}` });
    }
  };

  const fields: { key: keyof StoragePaths; label: string; hint: string }[] = [
    { key: "dataDir", label: "SQLite 数据目录", hint: "dailyflow.db 存放位置；留空使用默认（安装目录\\data）" },
    { key: "cacheDir", label: "缓存目录", hint: "留空使用默认（安装目录\\cache）；为新闻图片等缓存预留" },
    { key: "backupDir", label: "备份目录", hint: "备份文件存放位置；留空使用默认（数据目录\\backups）" },
  ];

  return (
    <div className="space-y-4 rounded-md border border-line bg-surface p-5">
      {!loaded && <p className="text-sm text-ink-3">加载中…</p>}
      {loaded &&
        fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm text-ink">{f.label}</label>
            <input
              value={paths[f.key]}
              onChange={(e) => {
                setPaths((p) => ({ ...p, [f.key]: e.target.value }));
                setMsg(null);
              }}
              placeholder="留空使用默认位置"
              className={`mt-1 w-full rounded-md border px-2 py-1.5 text-sm ${
                errors[f.key] ? "border-red-400" : "border-line-strong"
              }`}
            />
            {errors[f.key] ? (
              <p className="mt-1 text-xs text-error">{errors[f.key]}</p>
            ) : (
              <p className="mt-1 text-xs text-ink-3">{f.hint}</p>
            )}
          </div>
        ))}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!loaded}
          className="rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:bg-line"
        >
          保存
        </button>
        {msg && (
          <span className={`text-xs ${msg.type === "ok" ? "text-warn" : "text-error"}`}>
            {msg.text}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-3">
        修改后不会自动移动现有数据；新目录首次启动会创建全新数据库。如需保留旧数据，请手动复制原目录中的 dailyflow.db，或使用「Data」页的备份恢复。
      </p>
    </div>
  );
}
