import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Inbox } from "lucide-react";
import { useNewsStore } from "../stores/newsStore";
import { NEWS_CATEGORIES, type CategoryFilter } from "../stores/newsStore";
import type { NewsItem } from "../db/repositories/newsRepository";
import NewsCard from "../components/news/NewsCard";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { openExternalUrl } from "../lib/openExternal";
import { formatRelativeTime, dateGroupLabel } from "../lib/news";
import { useAppStore } from "../stores/appStore";
import { useSettingsStore } from "../stores/settingsStore";

const PAGE_SIZE = 20;

export default function News() {
  const items = useNewsStore((s) => s.items);
  const loading = useNewsStore((s) => s.loading);
  const refreshing = useNewsStore((s) => s.refreshing);
  const error = useNewsStore((s) => s.error);
  const lastRefresh = useNewsStore((s) => s.lastRefresh);
  const categoryFilter = useNewsStore((s) => s.categoryFilter);
  const load = useNewsStore((s) => s.load);
  const refresh = useNewsStore((s) => s.refresh);
  const markRead = useNewsStore((s) => s.markRead);
  const toggleFavorite = useNewsStore((s) => s.toggleFavorite);
  const setCategoryFilter = useNewsStore((s) => s.setCategoryFilter);

  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const dbStatus = useAppStore((s) => s.dbStatus);
  const newsRefreshIntervalMinutes = useSettingsStore(
    (s) => s.settings.newsRefreshIntervalMinutes,
  );

  // 首次挂载（数据库就绪后）：读缓存；缓存为空则自动刷新一次
  useEffect(() => {
    if (dbStatus !== "ready") return;
    load().then(() => {
      if (useNewsStore.getState().items.length === 0) {
        refresh();
      }
    });
  }, [load, refresh, dbStatus]);

  // 自动刷新（间隔由设置控制，仅数据库就绪后）
  useEffect(() => {
    if (dbStatus !== "ready") return;
    const id = window.setInterval(() => {
      refresh();
    }, newsRefreshIntervalMinutes * 60_000);
    return () => window.clearInterval(id);
  }, [refresh, dbStatus, newsRefreshIntervalMinutes]);

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => v + PAGE_SIZE);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const filtered = useMemo(
    () =>
      categoryFilter === "all"
        ? items
        : items.filter((i) => i.category === categoryFilter),
    [items, categoryFilter],
  );

  const groups = useMemo(() => {
    const list = filtered.slice(0, visible);
    const map = new Map<string, NewsItem[]>();
    for (const item of list) {
      const key = dateGroupLabel(item.publishedAt ?? item.createdAt);
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([label, arr]) => ({ label, arr }));
  }, [filtered, visible]);

  async function handleOpen(item: NewsItem) {
    if (!item.isRead) markRead(item.id, true);
    try {
      await openExternalUrl(item.url);
    } catch {
      useAppStore.getState().pushToast("error", "打开原文失败（链接可能已失效）");
    }
  }

  const filters: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "全部" },
    ...NEWS_CATEGORIES.map((c) => ({ key: c as CategoryFilter, label: c })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="新闻"
        description={
          loading
            ? "加载中…"
            : lastRefresh
              ? `更新于 ${formatRelativeTime(lastRefresh)}`
              : "尚未刷新"
        }
        actions={
          <Button onClick={() => refresh()} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "刷新中…" : "刷新"}
          </Button>
        }
      />

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setCategoryFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${
              categoryFilter === f.key
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 错误 */}
      {error && (
        <ErrorState title="无法连接新闻源" message={error} onRetry={() => refresh()} />
      )}

      {/* 空状态 */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<Inbox size={32} />}
          title="暂无新闻"
          description="点击右上角「刷新」获取最新内容"
          action={
            <Button variant="secondary" size="sm" onClick={() => refresh()}>
              刷新
            </Button>
          }
        />
      )}

      {/* 卡片流（按日期分组，组内瀑布流） */}
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="mb-2 text-sm font-medium text-neutral-600">{g.label}</h2>
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {g.arr.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                onOpen={handleOpen}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </section>
      ))}

      {/* 无限滚动哨兵 */}
      {filtered.length > visible && (
        <div ref={sentinelRef} className="flex justify-center py-4 text-xs text-neutral-400">
          加载更多…
        </div>
      )}
    </div>
  );
}
