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
  | "defaults"
  | "categories"
  | "shortcuts"
  | "notifications"
  | "data"
  | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "通用" },
  { id: "appearance", label: "外观" },
  { id: "defaults", label: "默认" },
  { id: "categories", label: "分类" },
  { id: "shortcuts", label: "快捷键" },
  { id: "notifications", label: "通知" },
  { id: "data", label: "数据" },
  { id: "about", label: "关于" },
];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="设置" description="修改后立即保存到本地数据库，重启后依然生效。" />

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
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
      {tab === "appearance" && <AppearanceSection />}
      {tab === "defaults" && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            默认执行参数：决定“我通常怎么专注”。专注页内的时长/休息调整只作用于本次，不回写这里的默认值。
          </p>
          <PomodoroSection />
        </div>
      )}
      {tab === "categories" && <CategoriesSection />}
      {tab === "shortcuts" && <ShortcutsSection />}
      {tab === "notifications" && <NotificationSection />}
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
