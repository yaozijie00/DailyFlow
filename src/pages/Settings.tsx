import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useEffect } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import GeneralSection from "../components/settings/GeneralSection";
import PomodoroSection from "../components/settings/PomodoroSection";
import ShortcutsSection from "../components/settings/ShortcutsSection";
import CategoriesSection from "../components/settings/CategoriesSection";
import StorageSection from "../components/settings/StorageSection";
import DataSection from "../components/settings/DataSection";
import NewsSourcesSection from "../components/settings/NewsSourcesSection";

type Tab = "general" | "pomodoro" | "shortcuts" | "categories" | "news" | "storage" | "data";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "pomodoro", label: "番茄钟" },
  { id: "shortcuts", label: "快捷键" },
  { id: "categories", label: "分类" },
  { id: "news", label: "新闻" },
  { id: "storage", label: "存储" },
  { id: "data", label: "数据" },
];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("general");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="设置"
        description={
          <>
            修改后立即保存到本地数据库，重启后依然生效。
            <span className="mt-1 block text-xs text-neutral-400">
              DailyFlow 版本 {appVersion || "…"}
            </span>
          </>
        }
      />

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
      {tab === "news" && <NewsSourcesSection />}
      {tab === "storage" && <StorageSection />}
      {tab === "data" && <DataSection />}
    </div>
  );
}
