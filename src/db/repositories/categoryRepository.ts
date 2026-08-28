import { eq, sql } from "drizzle-orm";
import type { Db } from "../db";
import { categories } from "../schema";

export type Category = typeof categories.$inferSelect;

const DEFAULT_CATEGORIES = ["开发", "设计", "学习", "工作", "生活", "其他"];

export class CategoryRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<Category[]> {
    return this.db
      .select()
      .from(categories)
      .orderBy(categories.sortOrder, categories.id)
      .all();
  }

  async findById(id: number): Promise<Category | null> {
    const row = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .get();
    return row ?? null;
  }

  async findByName(name: string): Promise<Category | null> {
    const row = await this.db
      .select()
      .from(categories)
      .where(eq(categories.name, name))
      .get();
    return row ?? null;
  }

  async create(name: string): Promise<Category> {
    const rows = await this.db
      .insert(categories)
      .values({ name, createdAt: Date.now(), sortOrder: await this.nextSortOrder() })
      .returning()
      .all();
    return rows[0];
  }

  private async nextSortOrder(): Promise<number> {
    const row = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0) + 1` })
      .from(categories)
      .get();
    return Number(row?.max ?? 1);
  }

  async update(id: number, name: string): Promise<Category | null> {
    const rows = await this.db
      .update(categories)
      .set({ name })
      .where(eq(categories.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  /** 按传入 id 顺序整体重排（sort_order = 下标）。 */
  async reorder(orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(categories)
        .set({ sortOrder: i })
        .where(eq(categories.id, orderedIds[i]))
        .run();
    }
  }

  async seedDefaults(): Promise<Category[]> {
    const result: Category[] = [];
    for (const name of DEFAULT_CATEGORIES) {
      const existing = await this.findByName(name);
      result.push(existing ?? (await this.create(name)));
    }
    return result;
  }
}
