import { useEffect, useMemo, useState, type ComponentType } from "react";
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
import ExtensionSection from "../components/settings/ExtensionSection";
import {
  ExtensionErrorBoundary,
  useEnabledSettingsSections,
} from "../extensions/host";

type CoreTab =
  | "general"
  | "appearance"
  | "defaults"
  | "categories"
  | "shortcuts"
  | "notifications"
  | "data"
  | "extensions"
  | "about";

interface SettingsDefinition {
  id: CoreTab;
  label: string;
  Component: ComponentType;
}

function DefaultsSection() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        默认执行参数：决定“我通常怎么专注”。专注页内的时长和休息调整只作用于本次。
      </p>
      <PomodoroSection />
    </div>
  );
}

function DataSettingsSection() {
  return (
    <div className="space-y-4">
      <StorageSection />
      <DataSection />
    </div>
  );
}

const CORE_SECTIONS: SettingsDefinition[] = [
  { id: "general", label: "通用", Component: GeneralSection },
  { id: "appearance", label: "外观", Component: AppearanceSection },
  { id: "defaults", label: "专注默认值", Component: DefaultsSection },
  { id: "categories", label: "分类", Component: CategoriesSection },
  { id: "shortcuts", label: "快捷键", Component: ShortcutsSection },
  { id: "notifications", label: "通知", Component: NotificationSection },
  { id: "data", label: "数据", Component: DataSettingsSection },
  { id: "extensions", label: "扩展", Component: ExtensionSection },
  { id: "about", label: "关于", Component: AboutSection },
];

export default function Settings() {
  const [tab, setTab] = useState<string>("general");
  const extensionSections = useEnabledSettingsSections();
  const tabs = useMemo(
    () => [
      ...CORE_SECTIONS.map((section) => ({ id: section.id, label: section.label })),
      ...extensionSections.map((section) => ({
        id: section.key,
        label: `${section.extensionName} · ${section.label}`,
      })),
    ],
    [extensionSections],
  );
  const coreSection = CORE_SECTIONS.find((section) => section.id === tab);
  const extensionSection = extensionSections.find((section) => section.key === tab);

  useEffect(() => {
    if (!coreSection && !extensionSection) setTab("general");
  }, [coreSection, extensionSection]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="设置" description="修改后立即保存到本地数据库，重启后依然生效。" />

      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <nav
          className="grid shrink-0 grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-surface p-2 md:sticky md:top-0 md:w-40 md:grid-cols-1"
          aria-label="设置分类"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                tab === t.id
                  ? "bg-accent text-on-accent"
                  : "text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0 flex-1" aria-live="polite">
          {coreSection && <coreSection.Component />}
          {extensionSection && (
            <ExtensionErrorBoundary
              key={extensionSection.key}
              label={`${extensionSection.extensionName} 设置`}
            >
              <extensionSection.Component />
            </ExtensionErrorBoundary>
          )}
        </section>
      </div>
    </div>
  );
}
