import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/** 关于：版本与应用信息。 */
export default function AboutSection() {
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  return (
    <div className="space-y-4 rounded-md border border-neutral-200 bg-white p-5">
      <div>
        <div className="text-lg font-semibold text-neutral-900">DailyFlow</div>
        <div className="mt-0.5 text-sm text-neutral-500">
          本地优先的个人时间管理与专注工具
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">当前版本</span>
        <span className="text-neutral-900">V{appVersion || "…"}</span>
      </div>
      <p className="text-xs text-neutral-400">
        数据完全存储在本地 SQLite，无需账号、无需联网。
      </p>
    </div>
  );
}
