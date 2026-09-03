import { useState } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import GeneralSection from "../components/settings/GeneralSection";
import AppearanceSection from "../components/settings/AppearanceSection";
import CategoriesSection from "../components/settings/CategoriesSection";
import ShortcutsSection from "../components/settings/ShortcutsSection";
import NotificationSection from "../components/settings/NotificationSection";
import PomodoroSection from "../components/settings/PomodoroSection";
import StorageSection from "../components/settings/StorageSection";
import DataSection from "../components/settings/DataSection";
import AboutSection from "../components/settings/AboutSection";

type Tab =
  | "general"
  | "appearance"
  | "categories"
  | "shortcuts"
  | "notifications"
  | "pomodoro"
  | "data"
  | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "appearance", label: "外观" },
  { id: "categories", label: "分类" },
  { id: "shortcuts", label: "快捷键" },
  { id: "notifications", label: "通知" },
  { id: "pomodoro", label: "专注" },
  { id: "data", label: "数据" },
  { id: "about", label: "关于" },
];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="设置" description="修改后立即保存到本地数据库，重启后依然生效。" />

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.id
                ? "bg-brand text-white"
                : "text-ink-2 hover:bg-canvas"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "general" && <GeneralSection />}
      {tab === "appearance" && <AppearanceSection />}
      {tab === "categories" && <CategoriesSection />}
      {tab === "shortcuts" && <ShortcutsSection />}
      {tab === "notifications" && <NotificationSection />}
      {tab === "pomodoro" && <PomodoroSection />}
      {tab === "data" && (
        <div className="space-y-4">
          <StorageSection />
          <DataSection />
        </div>
      )}
      {tab === "about" && <AboutSection />}
    </div>
  );
}
