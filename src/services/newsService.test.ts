// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { NewsRepository } from "../db/repositories/newsRepository";
import { NewsSourceRepository } from "../db/repositories/newsSourceRepository";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { NewsService, normalizeUrl, type FeedFetcher } from "./newsService";
import { DEFAULT_NEWS_SOURCES } from "../lib/newsSources";

function rssDoc(items: { title: string; url: string; guid?: string }[]): string {
  const body = items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.url}</link>${
          i.guid ? `<guid>${i.guid}</guid>` : ""
        }</item>`,
    )
    .join("");
  return `<rss version="2.0"><channel>${body}</channel></rss>`;
}

const EMPTY = rssDoc([]);

describe("normalizeUrl", () => {
  it("去除 hash、追踪参数与末尾斜杠", () => {
    expect(normalizeUrl("https://e.com/a/?utm_source=x&id=1#top")).toBe(
      "https://e.com/a?id=1",
    );
  });
});

describe("NewsService", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    await new NewsSourceRepository(db).seedDefaults(DEFAULT_NEWS_SOURCES);
  });

  afterEach(() => close());

  function makeService(fetcher?: FeedFetcher): NewsService {
    return new NewsService(
      new NewsRepository(db),
      new NewsSourceRepository(db),
      new SettingsRepository(db),
      fetcher,
    );
  }

  it("去重：同一 guid 来自多个源只插入一次", async () => {
    const fetcher: FeedFetcher = async () =>
      rssDoc([{ title: "X", url: "https://e.com/x", guid: "g-x" }]);
    const r = await makeService(fetcher).refresh();
    expect(r.inserted).toBe(1);
    expect(r.skipped).toBe(DEFAULT_NEWS_SOURCES.length - 1);
    expect((await makeService(fetcher).listItems()).length).toBe(1);
  });

  it("去重：同一 URL 不同 guid 只插入一次", async () => {
    const first = DEFAULT_NEWS_SOURCES[0].url;
    const fetcher: FeedFetcher = async (url) =>
      url === first
        ? rssDoc([{ title: "X", url: "https://e.com/same", guid: "g-1" }])
        : rssDoc([{ title: "X", url: "https://e.com/same", guid: "g-2" }]);
    const service = makeService(fetcher);
    const r = await service.refresh();
    expect(r.inserted).toBe(1);
    expect((await service.listItems()).length).toBe(1);
  });

  it("单源失败不影响其他源", async () => {
    const bad = DEFAULT_NEWS_SOURCES[0].url;
    const fetcher: FeedFetcher = async (url) => {
      if (url === bad) throw new Error("network down");
      const id = encodeURIComponent(url);
      return rssDoc([{ title: "ok", url: `https://e.com/${id}`, guid: `g-${id}` }]);
    };
    const r = await makeService(fetcher).refresh();
    expect(r.failed).toBe(1);
    expect(r.inserted).toBe(DEFAULT_NEWS_SOURCES.length - 1);
  });

  it("全部源失败：inserted 为 0 且 failed 等于总数", async () => {
    const fetcher: FeedFetcher = async () => {
      throw new Error("offline");
    };
    const r = await makeService(fetcher).refresh();
    expect(r.inserted).toBe(0);
    expect(r.failed).toBe(DEFAULT_NEWS_SOURCES.length);
  });

  it("断网时仍可读取已缓存新闻", async () => {
    const fetcher: FeedFetcher = async () =>
      rssDoc([{ title: "cached", url: "https://e.com/cached", guid: "g-cached" }]);
    const service = makeService(fetcher);
    await service.refresh();

    // 断网：不再依赖 fetcher，直接读库
    const items = await service.listItems();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("cached");
  });

  it("记录最后刷新时间到 settings", async () => {
    const r = await makeService(async () => EMPTY).refresh();
    const last = await makeService(async () => EMPTY).getLastRefresh();
    expect(last).toBe(r.lastRefresh);
  });

  it("markRead / markFavorite 持久化", async () => {
    const fetcher: FeedFetcher = async () =>
      rssDoc([{ title: "m", url: "https://e.com/m", guid: "g-m" }]);
    const service = makeService(fetcher);
    await service.refresh();
    const [item] = await service.listItems();
    await service.markRead(item.id, true);
    await service.markFavorite(item.id, true);
    const [updated] = await service.listItems();
    expect(updated.isRead).toBe(true);
    expect(updated.isFavorite).toBe(true);
  });

  it("禁用源不参与刷新", async () => {
    const sources = new NewsSourceRepository(db);
    await sources.update(1, { enabled: false }); // 禁用第一个源
    const fetcher: FeedFetcher = async (url) => {
      const id = encodeURIComponent(url);
      return rssDoc([{ title: "ok", url: `https://e.com/${id}`, guid: `g-${id}` }]);
    };
    const r = await makeService(fetcher).refresh();
    expect(r.total).toBe(DEFAULT_NEWS_SOURCES.length - 1);
    expect(r.inserted).toBe(DEFAULT_NEWS_SOURCES.length - 1);
  });

  it("validateFeed：有效 RSS 返回 ok", async () => {
    const fetcher: FeedFetcher = async () =>
      rssDoc([{ title: "t", url: "https://e.com/t" }]);
    expect(await makeService(fetcher).validateFeed("https://e.com/feed")).toBe("ok");
  });

  it("validateFeed：非 RSS 返回 not_feed", async () => {
    const fetcher: FeedFetcher = async () => "<html><body>not a feed</body></html>";
    expect(await makeService(fetcher).validateFeed("https://e.com")).toBe("not_feed");
  });

  it("validateFeed：网络失败返回 network_error", async () => {
    const fetcher: FeedFetcher = async () => {
      throw new Error("down");
    };
    expect(await makeService(fetcher).validateFeed("https://e.com/feed")).toBe("network_error");
  });
});
