import { invoke } from "@tauri-apps/api/core";
import { parseFeed, type ParsedFeedItem } from "../lib/rssParser";
import {
  NewsRepository,
  type NewNewsItem,
  type NewsItem,
} from "../db/repositories/newsRepository";
import {
  NewsSourceRepository,
  type NewsSource,
  type CreateNewsSourceInput,
  type UpdateNewsSourceInput,
} from "../db/repositories/newsSourceRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";

export type FeedFetcher = (url: string) => Promise<string>;

/** 生产环境：经 Tauri 原生命令拉取（绕过前端 CORS，异步不阻塞 UI）。 */
export async function tauriFetchText(url: string): Promise<string> {
  return invoke<string>("fetch_text", { url });
}

const LAST_REFRESH_KEY = "news_last_refresh";

export interface RefreshResult {
  inserted: number;
  skipped: number;
  failed: number;
  total: number;
  lastRefresh: number;
}

/** 规范化 URL 用于去重：去 hash、去追踪参数、去路径末尾斜杠。 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    const search = new URLSearchParams(u.search);
    for (const k of Array.from(search.keys())) {
      if (k.startsWith("utm_")) search.delete(k);
    }
    u.search = search.toString();
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function toNewItem(source: string, category: string, it: ParsedFeedItem): NewNewsItem | null {
  const url = normalizeUrl(it.url);
  if (!url || !it.title) return null;
  return {
    guid: it.guid ? it.guid.trim() : null,
    url,
    title: it.title,
    source,
    imageUrl: it.imageUrl,
    summary: it.summary,
    category,
    publishedAt: it.publishedAt,
  };
}

/**
 * 新闻业务逻辑：拉取 → 解析 → 去重 → 本地缓存。
 * 所有网络 I/O 通过可注入的 fetchText（默认走 Tauri 原生命令），
 * 便于测试与隔离；失败不影响任务 / 时间轴 / 番茄钟。
 * 源从 news_sources 表读取（仅启用），可在 Settings 中配置。
 */
export class NewsService {
  constructor(
    private readonly news: NewsRepository,
    private readonly sources: NewsSourceRepository,
    private readonly settings: SettingsRepository,
    private readonly fetchText: FeedFetcher = tauriFetchText,
  ) {}

  /** 拉取所有启用源、解析、去重并落库；单源失败不影响其他源。 */
  async refresh(): Promise<RefreshResult> {
    const enabled = await this.sources.findAllEnabled();
    const settled = await Promise.allSettled(
      enabled.map(async (src) => {
        const xml = await this.fetchText(src.url);
        const parsed = parseFeed(xml);
        return { source: src.name, category: src.category, items: parsed };
      }),
    );

    let inserted = 0;
    let skipped = 0;
    let failed = 0;
    const seenGuid = new Set<string>();
    const seenUrl = new Set<string>();

    for (const r of settled) {
      if (r.status === "rejected") {
        failed += 1;
        continue;
      }
      for (const parsed of r.value.items) {
        const item = toNewItem(r.value.source, r.value.category, parsed);
        if (!item) continue;

        if (item.guid != null && seenGuid.has(item.guid)) {
          skipped += 1;
          continue;
        }
        if (seenUrl.has(item.url)) {
          skipped += 1;
          continue;
        }
        if (await this.news.existsByGuidOrUrl(item.guid, item.url)) {
          skipped += 1;
          continue;
        }

        await this.news.insert(item);
        inserted += 1;
        if (item.guid != null) seenGuid.add(item.guid);
        seenUrl.add(item.url);
      }
    }

    const lastRefresh = Date.now();
    await this.settings.set(LAST_REFRESH_KEY, String(lastRefresh));

    return { inserted, skipped, failed, total: enabled.length, lastRefresh };
  }

  /** 读取本地缓存（断网时仍可用）。 */
  async listItems(): Promise<NewsItem[]> {
    return this.news.list();
  }

  async markRead(id: number, read: boolean): Promise<void> {
    await this.news.markRead(id, read);
  }

  async markFavorite(id: number, favorite: boolean): Promise<void> {
    await this.news.markFavorite(id, favorite);
  }

  async getLastRefresh(): Promise<number | null> {
    const v = await this.settings.get(LAST_REFRESH_KEY);
    const n = v == null ? NaN : Number(v);
    return Number.isNaN(n) ? null : n;
  }

  /** 校验 URL 是否为可解析的 RSS/Atom Feed。 */
  async validateFeed(url: string): Promise<"ok" | "not_feed" | "network_error"> {
    try {
      const xml = await this.fetchText(url);
      return parseFeed(xml).length > 0 ? "ok" : "not_feed";
    } catch {
      return "network_error";
    }
  }

  // ---- 新闻源管理（Settings 使用） ----

  async listSources(): Promise<NewsSource[]> {
    return this.sources.findAll();
  }

  async createSource(input: CreateNewsSourceInput): Promise<NewsSource> {
    return this.sources.create(input);
  }

  async updateSource(id: number, input: UpdateNewsSourceInput): Promise<NewsSource | null> {
    return this.sources.update(id, input);
  }

  async deleteSource(id: number): Promise<boolean> {
    return this.sources.delete(id);
  }

  async reorderSources(orderedIds: number[]): Promise<void> {
    return this.sources.reorder(orderedIds);
  }
}
