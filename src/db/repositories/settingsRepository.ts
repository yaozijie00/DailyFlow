import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { settings } from "../schema";

export type Setting = typeof settings.$inferSelect;

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get();
    return row?.value ?? null;
  }

  /** 写入或覆盖一个键值（upsert）。 */
  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.select().from(settings).all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async delete(key: string): Promise<boolean> {
    const rows = await this.db
      .delete(settings)
      .where(eq(settings.key, key))
      .returning()
      .all();
    return rows.length > 0;
  }
}
