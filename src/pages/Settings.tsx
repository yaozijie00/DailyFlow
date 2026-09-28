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
import { Input } from "../components/ui/Input";
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
  const [query, setQuery] = useState("");
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
  const keywords: Record<string, string> = {
    general: "启动 默认 页面 关闭 托盘 窗口 撤销 历史",
    appearance: "主题 浅色 深色 毛玻璃 外观 密度 视图 紧凑",
    defaults: "专注 番茄 休息 时长 默认",
    categories: "分类 名称 颜色",
    shortcuts: "快捷键 键盘 Ctrl 撤销 重做",
    notifications: "通知 提醒 声音",
    data: "数据 备份 恢复 导出 导入 路径 目录 存储 数据库 SQLite",
    extensions: "扩展 插件 启用 禁用 权限",
    about: "关于 版本 诊断 启动 性能 日志",
  };
  const term = query.trim().toLocaleLowerCase();
  const visibleTabs = tabs.filter((item) => `${item.label} ${keywords[item.id] ?? ""}`.toLocaleLowerCase().includes(term));
  const activeTab = visibleTabs.some((item) => item.id === tab) ? tab : visibleTabs[0]?.id;
  const coreSection = CORE_SECTIONS.find((section) => section.id === activeTab);
  const extensionSection = extensionSections.find((section) => section.key === activeTab);

  useEffect(() => {
    if (!tabs.some((item) => item.id === tab)) setTab("general");
  }, [tabs, tab]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="设置" description="修改后立即保存到本地数据库，重启后依然生效。" />
      <Input type="search" aria-label="搜索设置" placeholder="搜索设置，例如主题、备份、快捷键…" value={query} onChange={(event) => setQuery(event.target.value)} className="mb-5 max-w-lg" />

      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <nav
          className="grid shrink-0 grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-surface p-2 md:sticky md:top-0 md:w-40 md:grid-cols-1"
          aria-label="设置分类"
        >
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={activeTab === t.id ? "page" : undefined}
              className={`cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                activeTab === t.id
                  ? "bg-accent-soft font-medium text-accent-strong"
                  : "text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="min-w-0 flex-1" aria-live="polite">
          {visibleTabs.length === 0 && <p className="py-8 text-body text-text-muted">没有找到相关设置，试试「主题」「备份」或「快捷键」。</p>}
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
