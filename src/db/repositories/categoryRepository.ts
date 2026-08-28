import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { categories } from "../schema";

export type Category = typeof categories.$inferSelect;

const DEFAULT_CATEGORIES = ["开发", "设计", "学习", "工作", "生活", "其他"];

export class CategoryRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<Category[]> {
    return this.db.select().from(categories).all();
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
      .values({ name, createdAt: Date.now() })
      .returning()
      .all();
    return rows[0];
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

  async seedDefaults(): Promise<Category[]> {
    const result: Category[] = [];
    for (const name of DEFAULT_CATEGORIES) {
      const existing = await this.findByName(name);
      result.push(existing ?? (await this.create(name)));
    }
    return result;
  }
}
