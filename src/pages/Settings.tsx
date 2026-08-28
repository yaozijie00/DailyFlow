import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";
import GeneralSection from "../components/settings/GeneralSection";
import PomodoroSection from "../components/settings/PomodoroSection";
import ShortcutsSection from "../components/settings/ShortcutsSection";
import CategoriesSection from "../components/settings/CategoriesSection";
import StorageSection from "../components/settings/StorageSection";
import DataSection from "../components/settings/DataSection";

type Tab = "general" | "pomodoro" | "shortcuts" | "categories" | "storage" | "data";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "pomodoro", label: "Pomodoro" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "categories", label: "Categories" },
  { id: "storage", label: "Storage" },
  { id: "data", label: "Data" },
];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("general");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  return (
    <div className="max-w-lg">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-neutral-500">修改后立即保存到本地数据库，重启后依然生效。</p>
        <p className="mt-1 text-xs text-neutral-400">DailyFlow 版本 {appVersion || "…"}</p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "general" && <GeneralSection />}
      {tab === "pomodoro" && <PomodoroSection />}
      {tab === "shortcuts" && <ShortcutsSection />}
      {tab === "categories" && <CategoriesSection />}
      {tab === "storage" && <StorageSection />}
      {tab === "data" && <DataSection />}
    </div>
  );
}
