import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { newsSources } from "../schema";

export type NewsSource = typeof newsSources.$inferSelect;

export interface CreateNewsSourceInput {
  name: string;
  url: string;
  category: string;
  enabled?: boolean;
}

export type UpdateNewsSourceInput = Partial<CreateNewsSourceInput>;

export class NewsSourceRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<NewsSource[]> {
    return this.db
      .select()
      .from(newsSources)
      .orderBy(asc(newsSources.sortOrder), asc(newsSources.id))
      .all();
  }

  /** 启用的源（用于刷新拉取）。 */
  async findAllEnabled(): Promise<NewsSource[]> {
    return this.db
      .select()
      .from(newsSources)
      .where(eq(newsSources.enabled, true))
      .orderBy(asc(newsSources.sortOrder), asc(newsSources.id))
      .all();
  }

  async findById(id: number): Promise<NewsSource | null> {
    const row = await this.db
      .select()
      .from(newsSources)
      .where(eq(newsSources.id, id))
      .get();
    return row ?? null;
  }

  async findByUrl(url: string): Promise<NewsSource | null> {
    const row = await this.db
      .select()
      .from(newsSources)
      .where(eq(newsSources.url, url))
      .get();
    return row ?? null;
  }

  async create(input: CreateNewsSourceInput): Promise<NewsSource> {
    const rows = await this.db
      .insert(newsSources)
      .values({
        name: input.name,
        url: input.url,
        category: input.category,
        enabled: input.enabled ?? true,
        sortOrder: await this.nextSortOrder(),
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return rows[0];
  }

  private async nextSortOrder(): Promise<number> {
    const row = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${newsSources.sortOrder}), 0) + 1` })
      .from(newsSources)
      .get();
    return Number(row?.max ?? 1);
  }

  async update(id: number, input: UpdateNewsSourceInput): Promise<NewsSource | null> {
    const rows = await this.db
      .update(newsSources)
      .set({ ...input })
      .where(eq(newsSources.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(newsSources)
      .where(eq(newsSources.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  async reorder(orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(newsSources)
        .set({ sortOrder: i })
        .where(eq(newsSources.id, orderedIds[i]))
        .run();
    }
  }

  /** 首次初始化：表为空时写入默认源，返回最终列表。 */
  async seedDefaults(defaults: CreateNewsSourceInput[]): Promise<NewsSource[]> {
    const existing = await this.findAll();
    if (existing.length > 0) return existing;
    const result: NewsSource[] = [];
    for (const d of defaults) {
      result.push(await this.create(d));
    }
    return result;
  }
}
