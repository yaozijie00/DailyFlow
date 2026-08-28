import { desc, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { newsItems } from "../schema";

export type NewsItem = typeof newsItems.$inferSelect;

export interface NewNewsItem {
  guid: string | null;
  url: string;
  title: string;
  source: string;
  imageUrl: string | null;
  summary: string | null;
  category: string;
  publishedAt: number | null;
}

export class NewsRepository {
  constructor(private readonly db: Db) {}

  /** 按 guid 或 url 判断是否已存在（跨 Feed 去重）。 */
  async existsByGuidOrUrl(guid: string | null, url: string): Promise<boolean> {
    const conds = [eq(newsItems.url, url)];
    if (guid != null) conds.push(eq(newsItems.guid, guid));
    const rows = await this.db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(or(...conds))
      .limit(1)
      .all();
    return rows.length > 0;
  }

  /** 插入一条新闻（冲突时忽略，避免同 Feed/跨 Feed 重复）。 */
  async insert(input: NewNewsItem): Promise<void> {
    await this.db
      .insert(newsItems)
      .values({
        guid: input.guid,
        url: input.url,
        title: input.title,
        source: input.source,
        imageUrl: input.imageUrl,
        summary: input.summary,
        category: input.category,
        publishedAt: input.publishedAt,
        isRead: false,
        isFavorite: false,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  }

  /** 全部新闻，按发布时间倒序（无时间的排后）。 */
  async list(): Promise<NewsItem[]> {
    return this.db
      .select()
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt), desc(newsItems.createdAt))
      .all();
  }

  async markRead(id: number, read: boolean): Promise<void> {
    await this.db
      .update(newsItems)
      .set({ isRead: read })
      .where(eq(newsItems.id, id))
      .run();
  }

  async markFavorite(id: number, favorite: boolean): Promise<void> {
    await this.db
      .update(newsItems)
      .set({ isFavorite: favorite })
      .where(eq(newsItems.id, id))
      .run();
  }

  /** 清空全部新闻（刷新前可选调用；当前版本保留历史，不做清理）。 */
  async count(): Promise<number> {
    const rows = await this.db.select({ n: sql<number>`count(*)` }).from(newsItems).all();
    return Number(rows[0]?.n ?? 0);
  }
}
